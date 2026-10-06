require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Valida las variables de entorno obligatorias ANTES de cargar las rutas (que crean
// el cliente de Supabase al importarse). Así el error es un mensaje claro y no un
// stack trace dentro de node_modules.
const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(
    `Faltan variables de entorno obligatorias: ${missingEnvVars.join(", ")}.\n` +
      "Configúralas en el panel de tu hosting (en Render: Environment → Add Environment Variable) " +
      "o en tu archivo .env si corres el proyecto en local."
  );
  process.exit(1);
}

const authRoutes = require("./routes/auth");
const catalogRoutes = require("./routes/catalog-supabase");
const { requireAuthPage } = require("./middleware/requireAuth");

// Falla rápido si falta una clave de sesión propia: evita quedar protegido por el valor por defecto.
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("Falta SESSION_SECRET en las variables de entorno. No se puede iniciar en producción.");
    process.exit(1);
  }
  console.warn(
    "Advertencia: SESSION_SECRET no está definido. Se usará una clave temporal solo válida para desarrollo local."
  );
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = process.env.ADMIN_PATH || "/panel-kosecha";
const supabaseOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
})();

app.set("trust proxy", 1);
// Oculta la cabecera que delata el framework usado.
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", supabaseOrigin].filter(Boolean),
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Límite global de peticiones por IP, para mitigar abuso/DoS sobre la API.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    name: "kosecha.sid",
    secret: process.env.SESSION_SECRET || "clave-temporal-solo-para-desarrollo-local",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // secure:true requiere HTTPS. Actívalo al desplegar en producción con HTTPS.
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);

/* ---------------- Página pública del catálogo ---------------- */
// Todo lo que hay en /public es visible para cualquier visitante.
app.use(express.static(path.join(__dirname, "..", "public")));

/* ---------------- Imágenes subidas (logo y productos) ---------------- */
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

/* ---------------- Panel administrador (vista separada y protegida) ---------------- */
// El login se sirve sin autenticación (para poder iniciar sesión).
app.get(`${ADMIN_PATH}/login`, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin", "login.html"));
});
app.use(`${ADMIN_PATH}/assets`, express.static(path.join(__dirname, "..", "admin", "assets")));

// El resto del panel exige sesión de administrador activa.
app.get(ADMIN_PATH, requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin", "index.html"));
});
app.get(`${ADMIN_PATH}/`, requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin", "index.html"));
});

/* ---------------- API ---------------- */
app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);

// Le informa al frontend del panel bajo qué ruta vive (para armar sus propios links).
app.get("/api/config", (req, res) => {
  res.json({ adminPath: ADMIN_PATH });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.message && err.message.includes("imagen")) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
});

app.listen(PORT, () => {
  console.log(`Kosecha corriendo en http://localhost:${PORT}`);
  console.log(`Panel administrador en http://localhost:${PORT}${ADMIN_PATH}/login`);
});
