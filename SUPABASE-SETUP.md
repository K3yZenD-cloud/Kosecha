# 🔗 Integración de Supabase - Guía de Implementación

## ✅ Pasos Completados

He preparado todo lo necesario para integrar Supabase en tu proyecto. Aquí están los cambios:

### 1. **Archivo `.env` actualizado**
Se han agregado las credenciales de Supabase:
```env
SUPABASE_URL=https://ttmbnpddsbhuiunjikpr.supabase.co
SUPABASE_ANON_KEY=sb_publishable_7ndQEkPGiJ3vUpC24EayQg_tJxxJ-8v
SUPABASE_SERVICE_ROLE_KEY=AGREGAR_AQUI_TU_SERVICE_ROLE_KEY
```

### 2. **Nuevos archivos creados**

#### `scripts/setup-supabase.js`
Script automatizado que:
- Conecta a tu proyecto Supabase
- Crea las 3 tablas necesarias (catalog_meta, sections, products)
- Crea índices de base de datos
- Configura el bucket de almacenamiento
- Establece políticas de acceso

#### `server/storage-supabase.js`
Nueva capa de almacenamiento que:
- Lee/escribe en Supabase en lugar de archivos locales
- Maneja carga/eliminación de imágenes en Storage
- Mantiene la misma interfaz que el storage.js actual
- Incluye funciones para gestionar secciones y productos

### 3. **`package.json` actualizado**
- ✅ Agregada dependencia: `@supabase/supabase-js`
- ✅ Nuevo script npm: `npm run setup:supabase`

---

## 📋 PASOS PARA COMPLETAR LA CONFIGURACIÓN

### **Paso 1: Obtener el SERVICE_ROLE_KEY**

1. Ve a Supabase Dashboard
2. Click en **Project Settings** → **API**
3. Busca la sección **"Secret keys"** (scroll down)
4. Copia la key que aparece (es la larga que empieza con `eyJhbGciOi...`)
5. Es confidencial: NO la compartas públicamente

### **Paso 2: Agregar SERVICE_ROLE_KEY al `.env`**

Reemplaza esta línea en tu `.env`:
```env
SUPABASE_SERVICE_ROLE_KEY=AGREGAR_AQUI_TU_SERVICE_ROLE_KEY
```

Por:
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **Paso 3: Instalar dependencia de Supabase**

```bash
npm install @supabase/supabase-js
```

O simplemente:
```bash
npm install
```

### **Paso 4: Ejecutar el script de configuración**

```bash
npm run setup:supabase
```

Este script:
- ✅ Conectará a tu Supabase
- ✅ Creará todas las tablas
- ✅ Configurará el almacenamiento
- ✅ Mostrará mensajes de éxito/error

Si todo va bien, verás:
```
✨ ¡Configuración de Supabase completada!
```

### **Paso 5: Verificar en Supabase**

Entra a tu dashboard de Supabase y:
1. Ve a **SQL Editor**
2. Ejecuta: `SELECT * FROM catalog_meta;`
3. Deberías ver 1 fila con los datos iniciales

---

## 🔄 SIGUIENTES CAMBIOS AL CÓDIGO

Una vez ejecutado `npm run setup:supabase`, necesitaré actualizar:

1. **`server/routes/catalog.js`**
   - Cambiar `require("../storage")` por `require("../storage-supabase")`
   - Actualizar la lógica de manejo de imágenes

2. **`server/index.js`**
   - Pequeños ajustes si es necesario

Estos cambios puedo hacerlos automáticamente una vez que confirmes que el setup funcionó.

---

## 📌 RESUMEN DE ARCHIVOS

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `.env` | Actualizado | Agregadas credenciales de Supabase |
| `package.json` | Actualizado | Agregada dependencia y script |
| `scripts/setup-supabase.js` | ✨ Nuevo | Configuración automática |
| `server/storage-supabase.js` | ✨ Nuevo | Capa de almacenamiento Supabase |
| `server/storage.js` | Sin cambios | Será reemplazado después |

---

## ⚠️ IMPORTANTE

### No olvides:
- ✅ El `.env` con `SUPABASE_SERVICE_ROLE_KEY` real
- ✅ Ejecutar `npm install` para instalar dependencias
- ✅ Ejecutar `npm run setup:supabase` antes de arrancar el servidor

### No hagas aún:
- ❌ No ejecutes `npm run dev` hasta completar el paso 4
- ❌ No subas el `.env` a GitHub (agrégalo a `.gitignore`)

---

## 🆘 SI ALGO FALLA

Si el setup falla, el error te dirá exactamente qué pasó:
- **Error de conexión**: Verifica que SUPABASE_URL y ANON_KEY sean correctos
- **Error de autenticación**: Verifica que SERVICE_ROLE_KEY esté correcto
- **Error de tablas**: Las tablas podrían ya existir (es normal)

---

**¿Completaste todo? Avísame y continuamos con los últimos cambios de código.**
