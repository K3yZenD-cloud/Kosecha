const express = require("express");
const bcrypt = require("bcryptjs");

const router = express.Router();

// Límite simple de intentos fallidos por proceso, para dificultar fuerza bruta.
const intentosFallidos = new Map(); // ip -> { count, lastAttempt }
const MAX_INTENTOS = 8;
const VENTANA_MS = 10 * 60 * 1000; // 10 minutos

function estaBloqueado(ip) {
  const registro = intentosFallidos.get(ip);
  if (!registro) return false;
  if (Date.now() - registro.lastAttempt > VENTANA_MS) {
    intentosFallidos.delete(ip);
    return false;
  }
  return registro.count >= MAX_INTENTOS;
}

function registrarIntentoFallido(ip) {
  const registro = intentosFallidos.get(ip) || { count: 0, lastAttempt: 0 };
  registro.count += 1;
  registro.lastAttempt = Date.now();
  intentosFallidos.set(ip, registro);
}

function limpiarIntentos(ip) {
  intentosFallidos.delete(ip);
}

router.post("/login", async (req, res) => {
  const ip = req.ip;
  if (estaBloqueado(ip)) {
    return res.status(429).json({
      error: "Demasiados intentos fallidos. Intenta de nuevo en unos minutos.",
    });
  }

  const { username, password } = req.body || {};
  const usuarioValido = process.env.ADMIN_USERNAME;
  const hashValido = process.env.ADMIN_PASSWORD_HASH;

  if (!usuarioValido || !hashValido) {
    console.error("ADMIN_USERNAME o ADMIN_PASSWORD_HASH no están configurados en .env");
    return res.status(500).json({ error: "El panel administrador no está configurado en el servidor." });
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }

  // Siempre se ejecuta bcrypt.compare (aunque el usuario sea incorrecto) para que el
  // tiempo de respuesta no delate si el usuario existe (mitiga ataques de temporización).
  const claveCoincide = await bcrypt.compare(password, hashValido);
  const usuarioCoincide = username === usuarioValido;

  if (!usuarioCoincide || !claveCoincide) {
    registrarIntentoFallido(ip);
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  limpiarIntentos(ip);
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: "No se pudo iniciar sesión." });
    }
    req.session.isAdmin = true;
    req.session.username = username;
    res.json({ ok: true });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("kosecha.sid");
    res.json({ ok: true });
  });
});

router.get("/status", (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

module.exports = router;
