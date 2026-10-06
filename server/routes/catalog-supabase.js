const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const { requireAuthApi } = require("../middleware/requireAuth");

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente para operaciones públicas
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cliente para operaciones administrativas (solo en backend)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
// SVG queda excluido a propósito: puede contener <script> y permite XSS almacenado.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Configurar multer para memoria (en lugar de disco)
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Formato de imagen no permitido. Usa JPG, PNG, WEBP o GIF."));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_IMAGE_BYTES } });

/**
 * Genera un ID único
 */
function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sube una imagen a Supabase Storage y retorna la URL
 */
async function uploadImage(fileBuffer, fileName) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("uploads")
      .upload(fileName, fileBuffer, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    // Retornar URL pública
    const { data: publicUrl } = supabaseAdmin.storage
      .from("uploads")
      .getPublicUrl(data.path);

    return publicUrl.publicUrl;
  } catch (error) {
    throw new Error("No se pudo subir la imagen: " + error.message);
  }
}

/**
 * Elimina una imagen de Supabase Storage
 */
async function deleteImage(imageUrl) {
  if (!imageUrl) return;

  try {
    // Extraer el nombre del archivo de la URL
    const fileName = imageUrl.split("/uploads/")[1];
    if (!fileName) return;

    const { error } = await supabaseAdmin.storage.from("uploads").remove([fileName]);

    if (error && !error.message.includes("not found")) {
      console.warn("Advertencia al eliminar imagen:", error.message);
    }
  } catch (error) {
    console.warn("No se pudo eliminar imagen:", error.message);
  }
}

/**
 * Lee el catálogo completo
 */
async function getCatalog() {
  try {
    const { data: metaData, error: metaError } = await supabaseAdmin
      .from("catalog_meta")
      .select("*")
      .eq("id", 1)
      .single();

    if (metaError) throw metaError;

    const { data: sectionsData, error: sectionsError } = await supabaseAdmin
      .from("sections")
      .select("*")
      .order("order", { ascending: true });

    if (sectionsError) throw sectionsError;

    // Cargar productos para cada sección
    const sections = await Promise.all(
      sectionsData.map(async (section) => {
        const { data: products, error } = await supabaseAdmin
          .from("products")
          .select("*")
          .eq("section_id", section.id)
          .order("order", { ascending: true });

        if (error) throw error;

        return {
          id: section.id,
          name: section.name,
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            weight: p.weight,
            price: p.price,
            wholesalePrice: p.wholesale_price,
            variants: Array.isArray(p.variants) ? p.variants : [],
            image: p.image_url,
          })),
        };
      })
    );

    return {
      businessName: metaData.business_name,
      tagline: metaData.tagline,
      footerNote: metaData.footer_note,
      contact: metaData.contact,
      logo: metaData.logo_url,
      sections: sections,
    };
  } catch (error) {
    throw new Error("No se pudo cargar el catálogo: " + error.message);
  }
}

/* ================== RUTAS PÚBLICAS ================== */

// Leer catálogo (público)
router.get("/catalog", async (req, res) => {
  try {
    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo cargar el catálogo." });
  }
});

/* ================== RUTAS ADMINISTRATIVAS ================== */
router.use(requireAuthApi);

// Actualizar datos generales (nombre, tagline, etc.) - actualizacion parcial
router.patch("/catalog/meta", express.json(), async (req, res) => {
  const { businessName, tagline, footerNote, contact } = req.body || {};
  try {
    const updateData = {};
    if (typeof businessName === "string") updateData.business_name = businessName.trim();
    if (typeof tagline === "string") updateData.tagline = tagline.trim();
    if (typeof footerNote === "string") updateData.footer_note = footerNote.trim();
    if (typeof contact === "string") updateData.contact = contact.trim();
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("catalog_meta")
      .update(updateData)
      .eq("id", 1);

    if (error) throw error;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo actualizar la información." });
  }
});

// Actualizar logo
router.put("/catalog/logo", upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });
  try {
    // Obtener logo actual para eliminarlo
    const { data: currentMeta } = await supabaseAdmin
      .from("catalog_meta")
      .select("logo_url")
      .eq("id", 1)
      .single();

    if (currentMeta?.logo_url) {
      await deleteImage(currentMeta.logo_url);
    }

    // Subir nuevo logo
    const fileName = `logo-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
    const newLogoUrl = await uploadImage(req.file.buffer, fileName);

    // Actualizar en BD
    const { error } = await supabaseAdmin
      .from("catalog_meta")
      .update({
        logo_url: newLogoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw error;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo actualizar el logo." });
  }
});

/* ================== SECCIONES ================== */

// Crear sección
router.post("/sections", express.json(), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre de la sección es obligatorio." });
  }
  try {
    const id = generateId("sec");

    // Obtener el siguiente order
    const { data: lastSection } = await supabaseAdmin
      .from("sections")
      .select("order")
      .order("order", { ascending: false })
      .limit(1);

    const newOrder = lastSection && lastSection.length > 0 ? lastSection[0].order + 1 : 0;

    const { error } = await supabaseAdmin.from("sections").insert([
      {
        id,
        name: name.trim(),
        order: newOrder,
      },
    ]);

    if (error) throw error;

    const catalog = await getCatalog();
    res.status(201).json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear la sección." });
  }
});

// Actualizar sección (actualizacion parcial: unico campo editable es el nombre)
router.patch("/sections/:id", express.json(), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre de la sección es obligatorio." });
  }
  try {
    const { error } = await supabaseAdmin
      .from("sections")
      .update({
        name: name.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id);

    if (error) throw error;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo actualizar la sección." });
  }
});

// Eliminar sección
router.delete("/sections/:id", async (req, res) => {
  try {
    // Obtener productos para eliminar imágenes
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("section_id", req.params.id);

    if (products) {
      for (const product of products) {
        if (product.image_url) {
          await deleteImage(product.image_url);
        }
      }
    }

    // Eliminar sección (productos se eliminarán por cascada)
    const { error } = await supabaseAdmin.from("sections").delete().eq("id", req.params.id);

    if (error) throw error;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo eliminar la sección." });
  }
});

// Reordenar secciones: reemplaza el orden completo de la coleccion (recurso "order", no un verbo en la URL)
router.put("/sections/order", express.json(), async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "Formato de orden inválido." });
  }
  try {
    for (let i = 0; i < order.length; i++) {
      const { error } = await supabaseAdmin
        .from("sections")
        .update({
          order: i,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order[i]);

      if (error) throw error;
    }

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo reordenar las secciones." });
  }
});

/* ================== PRODUCTOS ================== */

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

// Crear producto
router.post("/sections/:sectionId/products", upload.single("image"), async (req, res) => {
  const error = validarDatosProducto(req.body || {});
  if (error) return res.status(400).json({ error });
  const { variants, error: variantsError } = parseVariantes(req.body?.variants);
  if (variantsError) return res.status(400).json({ error: variantsError });
  try {
    const id = generateId("prod");
    let imageUrl = null;

    // Subir imagen si existe
    if (req.file) {
      const fileName = `product-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
      imageUrl = await uploadImage(req.file.buffer, fileName);
    }

    // Obtener siguiente order
    const { data: lastProduct } = await supabaseAdmin
      .from("products")
      .select("order")
      .eq("section_id", req.params.sectionId)
      .order("order", { ascending: false })
      .limit(1);

    const newOrder = lastProduct && lastProduct.length > 0 ? lastProduct[0].order + 1 : 0;

    const { error: insertError } = await supabaseAdmin.from("products").insert([
      {
        id,
        section_id: req.params.sectionId,
        name: req.body.name.trim(),
        weight: req.body.weight || null,
        price: Number(req.body.price),
        wholesale_price: req.body.wholesalePrice ? String(req.body.wholesalePrice).trim() : null,
        variants,
        image_url: imageUrl,
        order: newOrder,
      },
    ]);

    if (insertError) throw insertError;

    const catalog = await getCatalog();
    res.status(201).json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear el producto." });
  }
});

// Actualizar producto (actualizacion parcial)
router.patch("/products/:id", upload.single("image"), async (req, res) => {
  const error = validarDatosProducto(req.body || {});
  if (error) return res.status(400).json({ error });
  const { variants, error: variantsError } = parseVariantes(req.body?.variants);
  if (variantsError) return res.status(400).json({ error: variantsError });
  try {
    // Obtener producto actual
    const { data: currentProduct } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!currentProduct) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    let imageUrl = currentProduct.image_url;

    // Si hay nueva imagen
    if (req.file) {
      // Eliminar imagen anterior
      if (imageUrl) {
        await deleteImage(imageUrl);
      }
      // Subir nueva imagen
      const fileName = `product-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
      imageUrl = await uploadImage(req.file.buffer, fileName);
    }

    const updateData = {
      name: req.body.name.trim(),
      weight: req.body.weight || null,
      price: Number(req.body.price),
      wholesale_price: req.body.wholesalePrice ? String(req.body.wholesalePrice).trim() : null,
      variants,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    };

    // Si se proporciona sectionId, mover a otra sección
    if (req.body.sectionId && req.body.sectionId !== currentProduct.section_id) {
      updateData.section_id = req.body.sectionId;
    }

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", req.params.id);

    if (updateError) throw updateError;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo actualizar el producto." });
  }
});

// Eliminar producto
router.delete("/products/:id", async (req, res) => {
  try {
    // Obtener producto para eliminar imagen
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("id", req.params.id)
      .single();

    if (product?.image_url) {
      await deleteImage(product.image_url);
    }

    // Eliminar producto
    const { error } = await supabaseAdmin.from("products").delete().eq("id", req.params.id);

    if (error) throw error;

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo eliminar el producto." });
  }
});

// Reordenar productos dentro de una seccion: reemplaza el orden completo (recurso "order")
router.put("/sections/:sectionId/products/order", express.json(), async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "Formato de orden inválido." });
  }
  try {
    for (let i = 0; i < order.length; i++) {
      const { error } = await supabaseAdmin
        .from("products")
        .update({
          order: i,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order[i]);

      if (error) throw error;
    }

    const catalog = await getCatalog();
    res.json(catalog);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo reordenar los productos." });
  }
});

module.exports = router;
