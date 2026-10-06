/**
 * Genera el hash bcrypt de una contraseña para usar como ADMIN_PASSWORD_HASH en el archivo .env
 *
 * Uso:
 *   npm run generar-hash -- "mi-contraseña-nueva"
 */
const bcrypt = require("bcryptjs");

const password = process.argv[2];
const MIN_LENGTH = 12;

if (!password) {
  console.error("Debes indicar una contraseña. Ejemplo:");
  console.error('  npm run generar-hash -- "mi-contraseña-nueva"');
  process.exit(1);
}

if (password.length < MIN_LENGTH) {
  console.error(`La contraseña es muy corta. Usa al menos ${MIN_LENGTH} caracteres, combinando mayúsculas, minúsculas, números y símbolos.`);
  process.exit(1);
}

// Costo 12: más lento de fuerza-bruta que el valor por defecto (10), sin afectar la experiencia de login.
const hash = bcrypt.hashSync(password, 12);
console.log("\nCopia esta línea en tu archivo .env:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
