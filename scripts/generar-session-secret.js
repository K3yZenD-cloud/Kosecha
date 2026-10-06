/**
 * Genera una clave aleatoria y segura para SESSION_SECRET en el archivo .env.
 *
 * Uso:
 *   npm run generar-secret
 */
const crypto = require("crypto");

const secret = crypto.randomBytes(48).toString("hex");
console.log("\nCopia esta línea en tu archivo .env:\n");
console.log(`SESSION_SECRET=${secret}\n`);
