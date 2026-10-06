const ADMIN_PATH = process.env.ADMIN_PATH || "/panel-kosecha";

/**
 * Protege rutas de API: si no hay sesión de administrador activa, responde 401.
 */
function requireAuthApi(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: "No autorizado. Inicia sesión en el panel administrador." });
}

/**
 * Protege páginas HTML del panel: si no hay sesión, redirige al login del panel.
 */
function requireAuthPage(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect(`${ADMIN_PATH}/login`);
}

module.exports = { requireAuthApi, requireAuthPage };
