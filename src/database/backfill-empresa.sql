-- =============================================================================
-- Backfill multi-empresa (ejecutado el 2026-07-02 contra la DB de dev)
--
-- Contexto: el modelo pasó de mono-usuario a multi-usuario/empresa:
--   * users.empresa_id  (nuevo, nullable)  → empresa del usuario
--   * users.rol         (nuevo, default 'admin')
--   * ecf.empresa_id    (nuevo, nullable)  → scoping de comprobantes
--   * ncf_sequence      PK (usuario_id, tipo_ecf) → (empresa_id, tipo_ecf)
--
-- ANTES de recompilar la nueva entidad NcfSequence se respaldó la tabla:
--   CREATE TABLE ncf_sequence_backup AS TABLE ncf_sequence;  -- (usuario_id...)
--   DELETE FROM ncf_sequence;
-- para que synchronize pudiera recrear la PK sin perder contadores.
--
-- Ejecutar con:
--   docker exec -i ecf_saas_postgres psql -U postgres -d ecf_saas \
--     < src/database/backfill-empresa.sql
-- =============================================================================

BEGIN;

-- 1. Crear una Empresa por cada usuario sin empresa, desde sus campos legacy
--    (numeroRegistro→rnc, razonSocial, direccion, telefono, tipoContribuyente).
--    Si razonSocial está vacía se usa el nombre del usuario.
INSERT INTO empresas (rnc, "razonSocial", direccion, telefono, "tipoContribuyente")
SELECT
  u."numeroRegistro",
  COALESCE(NULLIF(u."razonSocial", ''), u.nombre),
  NULLIF(u.direccion, ''),
  NULLIF(u.telefono, ''),
  (u."tipoContribuyente"::text)::empresas_tipocontribuyente_enum
FROM users u
WHERE u.empresa_id IS NULL
  AND u."numeroRegistro" IS NOT NULL
ON CONFLICT (rnc) DO NOTHING;

-- 2. Asignar empresa_id a los usuarios (match por RNC).
UPDATE users u
SET empresa_id = e.id
FROM empresas e
WHERE u.empresa_id IS NULL
  AND e.rnc = u."numeroRegistro";

-- 3. Asignar empresa_id a los e-CF según el usuario que los creó.
--    (Los e-CF con usuario_id NULL quedan huérfanos, sin empresa.)
UPDATE ecf
SET empresa_id = u.empresa_id
FROM users u
WHERE ecf.usuario_id = u.id
  AND ecf.empresa_id IS NULL;

-- 4. Migrar los contadores de secuencia eNCF del respaldo a la nueva PK
--    (empresa_id, tipo_ecf). Se toma el MAX por empresa para no re-emitir
--    eNCF duplicados si varios usuarios de una empresa tenían contador.
INSERT INTO ncf_sequence (empresa_id, tipo_ecf, ultima_secuencia)
SELECT u.empresa_id, b.tipo_ecf, MAX(b.ultima_secuencia)
FROM ncf_sequence_backup b
JOIN users u ON u.id = b.usuario_id
WHERE u.empresa_id IS NOT NULL
GROUP BY u.empresa_id, b.tipo_ecf
ON CONFLICT (empresa_id, tipo_ecf)
DO UPDATE SET ultima_secuencia =
  GREATEST(ncf_sequence.ultima_secuencia, EXCLUDED.ultima_secuencia);

COMMIT;

-- Verificación
SELECT 'empresas' AS tabla, count(*) FROM empresas;
SELECT u.email, u.rol, u.empresa_id, e.rnc, e."razonSocial"
FROM users u LEFT JOIN empresas e ON e.id = u.empresa_id
ORDER BY u."createdAt";
SELECT count(*) AS ecf_sin_empresa FROM ecf WHERE empresa_id IS NULL AND usuario_id IS NOT NULL;
SELECT * FROM ncf_sequence;
