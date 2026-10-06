# Kosecha · Catálogo web + panel administrador

Catálogo web de una sola pantalla para Kosecha, con panel administrador privado en una
**vista separada** (no enlazada desde la página pública) y protegido con usuario y
contraseña.

## Estructura del proyecto

```
kosecha-catalogo/
├── data/
│   └── catalog.json         # Datos de ejemplo / respaldo local (no usado en producción)
├── public/                  # Página pública (lo que ve cualquier visitante)
│   ├── index.html
│   ├── css/styles.css
│   └── js/catalog.js
├── admin/                   # Panel administrador (vista separada y protegida)
│   ├── login.html
│   ├── index.html
│   └── assets/
│       ├── css/admin.css
│       └── js/{login.js, admin.js}
├── server/                  # Backend (Node.js + Express)
│   ├── index.js             # Punto de entrada del servidor
│   ├── middleware/requireAuth.js
│   └── routes/{auth.js, catalog-supabase.js}
├── uploads/                 # Carpeta local legacy (las imágenes viven en Supabase Storage)
├── scripts/{generar-hash-password.js, generar-session-secret.js, supabase-schema.sql}
├── .env.example
└── package.json
```

## 1. Instalación

Requisitos: [Node.js](https://nodejs.org) 18 o superior.

```bash
cd kosecha-catalogo
npm install
```

## 2. Configurar la credencial del administrador

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Define un usuario propio en `ADMIN_USERNAME` (evita usar `admin`).
3. Genera el hash de una contraseña fuerte (12+ caracteres, mayúsculas, minúsculas,
   números y símbolos). La contraseña **nunca** se guarda en texto plano, solo su hash:
   ```bash
   npm run generar-hash -- "la-contraseña-que-elijas"
   ```
4. Copia la línea `ADMIN_PASSWORD_HASH=...` que imprime el comando dentro de tu `.env`.
5. Genera una clave de sesión aleatoria y cópiala como `SESSION_SECRET`:
   ```bash
   npm run generar-secret
   ```
6. (Opcional) Cambia `ADMIN_PATH` si quieres que el panel viva en otra dirección
   (por defecto es `/panel-kosecha`).
7. Completa `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (ver
   [SUPABASE-SETUP.md](./SUPABASE-SETUP.md)). Antes de usar la app, ejecuta
   `scripts/supabase-schema.sql` en el SQL Editor de tu proyecto Supabase: crea las
   tablas y activa Row Level Security (sin esto, la clave pública `SUPABASE_ANON_KEY`
   podría usarse para leer/escribir el catálogo sin pasar por el login).

Para rotar las credenciales más adelante (por ejemplo, antes de publicar el repositorio
en GitHub), repite los pasos 3 y 5 y reinicia el servidor.

## 3. Ejecutar

```bash
npm start
```

- Catálogo público: `http://localhost:3000/`
- Panel administrador: `http://localhost:3000/panel-kosecha/login`

El panel administrador **no tiene ningún enlace visible desde la página pública**: solo
se accede escribiendo esa dirección directamente, y aun así exige usuario y contraseña
válidos para entrar. Cualquier intento de usar las rutas de la API que modifican datos
sin haber iniciado sesión responde con error 401 (no autorizado).

## 4. Cómo funciona

- **Página pública** (`/`): lee los datos desde `GET /api/catalog` y pinta las secciones
  desplegables con sus productos (imagen, nombre, peso, precio). No incluye buscador,
  carrito, pagos ni generación de PDF.
- **Panel administrador** (`/panel-kosecha`): permite editar el nombre y logo del
  negocio, crear/editar/eliminar secciones y productos, subir o reemplazar imágenes,
  reordenar secciones y productos arrastrando y soltando, y mover un producto de una
  sección a otra. Cada cambio se guarda de inmediato en Supabase (base de datos y
  storage) y se refleja al instante en la página pública.
- **Autenticación**: usa una sesión de servidor (cookie firmada, `httpOnly`) y una única
  cuenta de administrador definida por variables de entorno. Incluye un límite de
  intentos fallidos de inicio de sesión.
- **Imágenes**: se guardan en Supabase Storage (no como texto codificado), con un
  límite de 50 MB por imagen y formatos permitidos JPG/PNG/WEBP/GIF.

## 5. Seguridad incluida

- Contraseña de administrador con hash `bcrypt` (coste 12), nunca en texto plano.
- Límite de intentos fallidos de login por IP y comparación de contraseña con tiempo
  constante (evita enumerar usuarios por temporización).
- Cookies de sesión `httpOnly`, `sameSite=lax` y `secure` en producción.
- Cabeceras de seguridad HTTP vía `helmet` (CSP, sin `X-Powered-By`, etc.).
- Límite de peticiones (`express-rate-limit`) sobre toda la API.
- Subida de imágenes restringida a formatos raster (JPG/PNG/WEBP/GIF); se excluye SVG
  a propósito porque puede contener JavaScript ejecutable.
- Row Level Security en Supabase: la clave pública (`SUPABASE_ANON_KEY`) solo puede leer,
  nunca escribir; todas las escrituras pasan por el backend autenticado.

## 6. Notas para producción

Este proyecto está pensado como una base sólida y funcional, pero antes de publicarlo
en internet conviene:

- Servirlo detrás de HTTPS (y dejar `NODE_ENV=production` para que la cookie de sesión
  se marque como `secure`). Render lo hace automáticamente.
- Reemplazar el almacenamiento de sesiones en memoria (`express-session` por defecto)
  por uno persistente (ej. Redis) si corres más de una instancia o reinicias seguido.
- Nunca subir el archivo `.env` al repositorio (ya está en `.gitignore`); en Render,
  defínelo como variables de entorno del servicio.
- Hacer respaldos periódicos de la base de datos y el storage de Supabase.
- Si se requiere más de una cuenta administradora en el futuro, o notificaciones,
  historial de cambios, etc., se puede conversar aparte como una ampliación.

## 7. Información que debe entregar el cliente

- Plantilla visual (ya incorporada: paleta de colores entregada).
- Logo (se sube desde el panel administrador, sección "Información del negocio").
- Nombres de las secciones iniciales (se pueden cargar directamente desde el panel).
- Productos: nombre, peso, precio e imagen de cada uno (se cargan desde el panel).
