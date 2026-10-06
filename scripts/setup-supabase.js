#!/usr/bin/env node

/**
 * Verificación de configuración inicial de Supabase para kosecha-catalogo.
 *
 * IMPORTANTE: la creación de tablas, índices y políticas de seguridad (RLS)
 * NO se puede hacer de forma fiable con el cliente supabase-js (no existe
 * un RPC genérico para ejecutar SQL arbitrario en un proyecto nuevo).
 * Por eso ese trabajo vive en scripts/supabase-schema.sql: ábrelo, cópialo
 * en el SQL Editor del dashboard de Supabase (https://supabase.com/dashboard
 * → tu proyecto → SQL Editor → New query) y ejecútalo antes de usar la app.
 * Ese archivo también activa Row Level Security, algo obligatorio: sin RLS,
 * cualquiera con la SUPABASE_ANON_KEY (pública por diseño) podría leer y
 * escribir el catálogo directamente, sin pasar por el login del panel.
 *
 * Uso:
 *   node scripts/setup-supabase.js
 *
 * Antes de ejecutar, asegúrate de que en .env tengas:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Error: Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

if (SUPABASE_SERVICE_ROLE_KEY === "AGREGAR_AQUI_TU_SERVICE_ROLE_KEY") {
  console.error("❌ Error: Debes agregar tu SERVICE_ROLE_KEY real en el .env");
  console.error("   Obtener de: Project Settings → API → Secret keys");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function setupDatabase() {
  console.log("🔧 Verificando configuración de Supabase...\n");
  console.log("👉 Paso manual obligatorio: ejecuta scripts/supabase-schema.sql");
  console.log("   en el SQL Editor de tu proyecto Supabase (crea tablas + activa RLS).\n");

  try {
    // ==================== VERIFICACIÓN ====================
    console.log("🔍 Verificando que las tablas existan y tengan datos...");

    const { data: metaData, error: metaError } = await supabase
      .from("catalog_meta")
      .select("*")
      .eq("id", 1);

    if (metaError) {
      throw new Error(
        `No se pudo leer catalog_meta (${metaError.message}). ¿Ya ejecutaste scripts/supabase-schema.sql en el SQL Editor?`
      );
    }

    if (metaData && metaData.length > 0) {
      console.log("✅ Tabla catalog_meta verificada\n");
      console.log("📋 Datos iniciales:");
      console.log(JSON.stringify(metaData[0], null, 2));
    }

    console.log("\n" + "=".repeat(50));
    console.log("✨ ¡Verificación completada!");
    console.log("=".repeat(50));
    console.log("\n📚 Próximos pasos:");
    console.log("1. Confirma en el dashboard (Authentication → Policies) que RLS está activo.");
    console.log("2. npm run dev");

  } catch (error) {
    console.error("\n❌ Error durante la verificación:");
    console.error(error.message);
    process.exit(1);
  }
}

setupDatabase();

