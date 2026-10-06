/**
 * storage.js - Capa de almacenamiento usando Supabase
 * Reemplaza el almacenamiento local de archivos JSON y imágenes
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY");
}

// Cliente para operaciones públicas (lectura del catálogo)
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cliente para operaciones administrativas (lectura/escritura protegida)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

// Cola simple para evitar operaciones concurrentes conflictivas
let operationQueue = Promise.resolve();

/**
 * Genera un ID único con prefijo
 */
function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Lee el catálogo completo desde Supabase
 */
async function readCatalog() {
  try {
    const { data: metaData, error: metaError } = await supabaseClient
      .from("catalog_meta")
      .select("*")
      .eq("id", 1)
      .single();

    if (metaError) throw metaError;

    const { data: sectionsData, error: sectionsError } = await supabaseClient
      .from("sections")
      .select("*")
      .order("order", { ascending: true });

    if (sectionsError) throw sectionsError;

    // Cargar productos para cada sección
    const sections = await Promise.all(
      sectionsData.map(async (section) => {
        const { data: products, error } = await supabaseClient
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
    console.error("Error leyendo catálogo:", error);
    throw new Error("No se pudo cargar el catálogo de Supabase");
  }
}

/**
 * Actualiza el catálogo usando una función mutadora
 * Envuelve la operación en cola para evitar conflictos
 */
async function updateCatalog(mutator) {
  return new Promise((resolve, reject) => {
    operationQueue = operationQueue
      .then(async () => {
        try {
          const catalog = await readCatalog();
          const updated = (await mutator(catalog)) || catalog;

          // Actualizar meta
          const { error: metaError } = await supabaseAdmin
            .from("catalog_meta")
            .update({
              business_name: updated.businessName,
              tagline: updated.tagline,
              footer_note: updated.footerNote,
              contact: updated.contact,
              logo_url: updated.logo,
              updated_at: new Date().toISOString(),
            })
            .eq("id", 1);

          if (metaError) throw metaError;

          resolve(updated);
        } catch (error) {
          reject(error);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/**
 * Sube una imagen a Supabase Storage
 * @param {Buffer} fileBuffer - Contenido del archivo
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<string>} URL pública de la imagen
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
    return `/uploads/${data.path}`;
  } catch (error) {
    console.error("Error subiendo imagen:", error);
    throw new Error("No se pudo subir la imagen");
  }
}

/**
 * Elimina una imagen de Supabase Storage
 */
async function deleteImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;

  try {
    const fileName = imageUrl.replace("/uploads/", "");
    const { error } = await supabaseAdmin.storage.from("uploads").remove([fileName]);

    if (error && !error.message.includes("not found")) {
      console.warn("Advertencia al eliminar imagen:", error.message);
    }
  } catch (error) {
    console.warn("No se pudo eliminar imagen:", error.message);
  }
}

/**
 * Crea una nueva sección
 */
async function createSection(name) {
  try {
    const id = generateId("sec");
    const { data: sections } = await supabaseAdmin
      .from("sections")
      .select("order")
      .order("order", { ascending: false })
      .limit(1);

    const newOrder = sections && sections.length > 0 ? sections[0].order + 1 : 0;

    const { error } = await supabaseAdmin.from("sections").insert([
      {
        id,
        name,
        order: newOrder,
      },
    ]);

    if (error) throw error;
    return id;
  } catch (error) {
    throw new Error("No se pudo crear la sección: " + error.message);
  }
}

/**
 * Actualiza una sección
 */
async function updateSection(sectionId, name) {
  try {
    const { error } = await supabaseAdmin
      .from("sections")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", sectionId);

    if (error) throw error;
  } catch (error) {
    throw new Error("No se pudo actualizar la sección: " + error.message);
  }
}

/**
 * Elimina una sección y sus productos
 */
async function deleteSection(sectionId) {
  try {
    // Eliminar imágenes de productos
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("section_id", sectionId);

    if (products) {
      for (const product of products) {
        if (product.image_url) {
          await deleteImage(product.image_url);
        }
      }
    }

    // Eliminar sección (productos se eliminarán por cascada)
    const { error } = await supabaseAdmin.from("sections").delete().eq("id", sectionId);

    if (error) throw error;
  } catch (error) {
    throw new Error("No se pudo eliminar la sección: " + error.message);
  }
}

/**
 * Crea un nuevo producto
 */
async function createProduct(sectionId, productData) {
  try {
    const id = generateId("prod");
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("order")
      .eq("section_id", sectionId)
      .order("order", { ascending: false })
      .limit(1);

    const newOrder = products && products.length > 0 ? products[0].order + 1 : 0;

    const { error } = await supabaseAdmin.from("products").insert([
      {
        id,
        section_id: sectionId,
        name: productData.name,
        weight: productData.weight || null,
        price: productData.price,
        image_url: productData.imageUrl || null,
        order: newOrder,
      },
    ]);

    if (error) throw error;
    return id;
  } catch (error) {
    throw new Error("No se pudo crear el producto: " + error.message);
  }
}

/**
 * Actualiza un producto
 */
async function updateProduct(productId, productData, newSectionId = null) {
  try {
    const updateData = {
      name: productData.name,
      weight: productData.weight || null,
      price: productData.price,
      updated_at: new Date().toISOString(),
    };

    if (productData.imageUrl !== undefined) {
      updateData.image_url = productData.imageUrl;
    }

    if (newSectionId) {
      updateData.section_id = newSectionId;
    }

    const { error } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", productId);

    if (error) throw error;
  } catch (error) {
    throw new Error("No se pudo actualizar el producto: " + error.message);
  }
}

/**
 * Elimina un producto
 */
async function deleteProduct(productId) {
  try {
    // Obtener URL de imagen
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("id", productId)
      .single();

    if (product && product.image_url) {
      await deleteImage(product.image_url);
    }

    // Eliminar producto
    const { error } = await supabaseAdmin.from("products").delete().eq("id", productId);

    if (error) throw error;
  } catch (error) {
    throw new Error("No se pudo eliminar el producto: " + error.message);
  }
}

/**
 * Reordena secciones
 */
async function reorderSections(sectionIds) {
  try {
    for (let i = 0; i < sectionIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("sections")
        .update({ order: i, updated_at: new Date().toISOString() })
        .eq("id", sectionIds[i]);

      if (error) throw error;
    }
  } catch (error) {
    throw new Error("No se pudo reordenar secciones: " + error.message);
  }
}

/**
 * Reordena productos dentro de una sección
 */
async function reorderProducts(productIds) {
  try {
    for (let i = 0; i < productIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("products")
        .update({ order: i, updated_at: new Date().toISOString() })
        .eq("id", productIds[i]);

      if (error) throw error;
    }
  } catch (error) {
    throw new Error("No se pudo reordenar productos: " + error.message);
  }
}

module.exports = {
  readCatalog,
  updateCatalog,
  uploadImage,
  deleteImage,
  createSection,
  updateSection,
  deleteSection,
  createProduct,
  updateProduct,
  deleteProduct,
  reorderSections,
  reorderProducts,
  generateId,
};
