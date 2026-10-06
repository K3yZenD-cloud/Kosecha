const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const { readCatalog, updateCatalog, generateId } = require("../storage");
const { requireAuthApi } = require("../middleware/requireAuth");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("El archivo debe ser una imagen."));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_IMAGE_BYTES } });

async function borrarImagenSiExiste(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(imageUrl));
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // si el archivo ya no existe, no es un problema
  }
}

function encontrarProducto(catalog, productId) {
  for (const section of catalog.sections) {
    const product = section.products.find((p) => p.id === productId);
    if (product) return { section, product };
  }
  return null;
}

/* ------------------------- Rutas públicas ------------------------- */

// Cualquier visitante puede leer el catálogo para ver la página pública.
router.get("/catalog", async (req, res) => {
  try {
    const catalog = await readCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo cargar el catálogo." });
  }
});

/* --------------------- A partir de aquí: solo admin --------------------- */
router.use(requireAuthApi);

// Datos generales del negocio (nombre, tagline, pie de página, contacto)
router.put("/catalog/meta", express.json(), async (req, res) => {
  const { businessName, tagline, footerNote, contact } = req.body || {};
  try {
    const catalog = await updateCatalog((c) => {
      if (typeof businessName === "string") c.businessName = businessName.trim();
      if (typeof tagline === "string") c.tagline = tagline.trim();
      if (typeof footerNote === "string") c.footerNote = footerNote.trim();
      if (typeof contact === "string") c.contact = contact.trim();
      return c;
    });
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo actualizar la información del negocio." });
  }
});

// Logo del emprendimiento
router.put("/catalog/logo", upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });
  try {
    const nuevaUrl = `/uploads/${req.file.filename}`;
    const catalog = await updateCatalog(async (c) => {
      await borrarImagenSiExiste(c.logo);
      c.logo = nuevaUrl;
      return c;
    });
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo actualizar el logo." });
  }
});

/* ------------------------------ Secciones ------------------------------ */

router.post("/sections", express.json(), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "El nombre de la sección es obligatorio." });
  try {
    const catalog = await updateCatalog((c) => {
      c.sections.push({ id: generateId("sec"), name: name.trim(), products: [] });
      return c;
    });
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo crear la sección." });
  }
});

router.put("/sections/:id", express.json(), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "El nombre de la sección es obligatorio." });
  try {
    const catalog = await updateCatalog((c) => {
      const section = c.sections.find((s) => s.id === req.params.id);
      if (!section) throw new Error("NOT_FOUND");
      section.name = name.trim();
      return c;
    });
    res.json(catalog);
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Sección no encontrada." });
    res.status(500).json({ error: "No se pudo renombrar la sección." });
  }
});

router.delete("/sections/:id", async (req, res) => {
  try {
    const catalog = await updateCatalog(async (c) => {
      const section = c.sections.find((s) => s.id === req.params.id);
      if (section) {
        for (const p of section.products) {
          await borrarImagenSiExiste(p.image);
        }
      }
      c.sections = c.sections.filter((s) => s.id !== req.params.id);
      return c;
    });
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo eliminar la sección." });
  }
});

// Reordenar secciones: body { order: [id1, id2, id3, ...] }
router.put("/sections/reorder", express.json(), async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "Formato de orden inválido." });
  try {
    const catalog = await updateCatalog((c) => {
      const byId = new Map(c.sections.map((s) => [s.id, s]));
      const reordenadas = order.map((id) => byId.get(id)).filter(Boolean);
      // agrega al final cualquier sección que no vino en "order" (por seguridad)
      for (const s of c.sections) if (!order.includes(s.id)) reordenadas.push(s);
      c.sections = reordenadas;
      return c;
    });
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: "No se pudo reordenar las secciones." });
  }
});

/* ------------------------------ Productos ------------------------------ */

function validarDatosProducto(body) {
  const { name, price } = body;
  if (!name || !String(name).trim()) return "El nombre del producto es obligatorio.";
  if (price === undefined || price === "" || isNaN(Number(price)) || Number(price) < 0) {
    return "Ingresa un precio válido.";
  }
  return null;
}

/**
 * Parsea y valida el JSON de variantes recibido desde el formulario.
 * Retorna { variants, error }: variants es null si error no es null.
 */
function parseVariantes(raw) {
  if (raw === undefined || raw === null || raw === "") return { variants: [], error: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { variants: null, error: "Formato de variantes inválido." };
  }
  if (!Array.isArray(parsed)) return { variants: null, error: "Formato de variantes inválido." };

  const clean = [];
  for (const v of parsed) {
    const label = String(v?.label ?? "").trim();
    if (!label) return { variants: null, error: "Cada variante necesita un nombre o formato." };
    if (v.price === undefined || v.price === "" || isNaN(Number(v.price)) || Number(v.price) < 0) {
      return { variants: null, error: `Ingresa un precio válido para la variante "${label}".` };
    }
    clean.push({
      id: v.id || generateId("variant"),
      label,
      price: Number(v.price),
      // Texto libre: permite indicar desde qué peso/cantidad aplica el precio mayorista.
      wholesalePrice: String(v?.wholesalePrice ?? "").trim() || null,
    });
  }
  return { variants: clean, error: null };
}

router.post("/sections/:sectionId/products", upload.single("image"), async (req, res) => {
  const error = validarDatosProducto(req.body || {});
  if (error) return res.status(400).json({ error });
  const { variants, error: variantsError } = parseVariantes(req.body?.variants);
  if (variantsError) return res.status(400).json({ error: variantsError });
  try {
    const catalog = await updateCatalog((c) => {
      const section = c.sections.find((s) => s.id === req.params.sectionId);
      if (!section) throw new Error("NOT_FOUND");
      section.products.push({
        id: generateId("prod"),
        name: req.body.name.trim(),
        weight: (req.body.weight || "").trim(),
        price: Number(req.body.price),
        wholesalePrice: req.body.wholesalePrice ? String(req.body.wholesalePrice).trim() : null,
        variants,
        image: req.file ? `/uploads/${req.file.filename}` : null,
      });
      return c;
    });
    res.json(catalog);
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Sección no encontrada." });
    res.status(500).json({ error: "No se pudo crear el producto." });
  }
});

// Editar producto. Puede incluir una nueva imagen y/o moverlo de sección (sectionId en el body).
router.put("/products/:id", upload.single("image"), async (req, res) => {
  const error = validarDatosProducto(req.body || {});
  if (error) return res.status(400).json({ error });
  const { variants, error: variantsError } = parseVariantes(req.body?.variants);
  if (variantsError) return res.status(400).json({ error: variantsError });
  try {
    const catalog = await updateCatalog(async (c) => {
      const found = encontrarProducto(c, req.params.id);
      if (!found) throw new Error("NOT_FOUND");
      const { section: seccionActual, product } = found;

      product.name = req.body.name.trim();
      product.weight = (req.body.weight || "").trim();
      product.price = Number(req.body.price);
      product.wholesalePrice = req.body.wholesalePrice ? String(req.body.wholesalePrice).trim() : null;
      product.variants = variants;

      if (req.file) {
        await borrarImagenSiExiste(product.image);
        product.image = `/uploads/${req.file.filename}`;
      }

      const nuevaSeccionId = req.body.sectionId;
      if (nuevaSeccionId && nuevaSeccionId !== seccionActual.id) {
        const destino = c.sections.find((s) => s.id === nuevaSeccionId);
        if (!destino) throw new Error("SECTION_NOT_FOUND");
        seccionActual.products = seccionActual.products.filter((p) => p.id !== product.id);
        destino.products.push(product);
      }
      return c;
    });
    res.json(catalog);
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Producto no encontrado." });
    if (e.message === "SECTION_NOT_FOUND") return res.status(404).json({ error: "Sección destino no encontrada." });
    res.status(500).json({ error: "No se pudo actualizar el producto." });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const catalog = await updateCatalog(async (c) => {
      const found = encontrarProducto(c, req.params.id);
      if (!found) throw new Error("NOT_FOUND");
      await borrarImagenSiExiste(found.product.image);
      found.section.products = found.section.products.filter((p) => p.id !== req.params.id);
      return c;
    });
    res.json(catalog);
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Producto no encontrado." });
    res.status(500).json({ error: "No se pudo eliminar el producto." });
  }
});

// Reordenar productos dentro de una sección: body { order: [id1, id2, ...] }
router.put("/sections/:sectionId/products/reorder", express.json(), async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "Formato de orden inválido." });
  try {
    const catalog = await updateCatalog((c) => {
      const section = c.sections.find((s) => s.id === req.params.sectionId);
      if (!section) throw new Error("NOT_FOUND");
      const byId = new Map(section.products.map((p) => [p.id, p]));
      const reordenados = order.map((id) => byId.get(id)).filter(Boolean);
      for (const p of section.products) if (!order.includes(p.id)) reordenados.push(p);
      section.products = reordenados;
      return c;
    });
    res.json(catalog);
  } catch (e) {
    if (e.message === "NOT_FOUND") return res.status(404).json({ error: "Sección no encontrada." });
    res.status(500).json({ error: "No se pudo reordenar los productos." });
  }
});

module.exports = router;
