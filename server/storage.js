const fs = require("fs/promises");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

// Cola simple para evitar que dos escrituras simultáneas corrompan el archivo.
let writeQueue = Promise.resolve();

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function readCatalog() {
  const raw = await fs.readFile(CATALOG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeCatalog(catalog) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf-8")
  );
  return writeQueue;
}

/**
 * Aplica una función mutadora sobre el catálogo actual y persiste el resultado.
 * Evita condiciones de carrera al encadenar lectura + escritura en la misma cola.
 */
async function updateCatalog(mutator) {
  const result = writeQueue.then(async () => {
    const catalog = await readCatalog();
    const output = (await mutator(catalog)) || catalog;
    await fs.writeFile(CATALOG_PATH, JSON.stringify(output, null, 2), "utf-8");
    return output;
  });
  writeQueue = result.catch(() => {});
  return result;
}

module.exports = { readCatalog, writeCatalog, updateCatalog, generateId };
