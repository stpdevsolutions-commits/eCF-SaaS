# Migraciones de TypeORM

La CLI usa `src/database/data-source.ts` (carga `.env`: `DATABASE_HOST/PORT/USER/PASSWORD/NAME`).
La app (app.module.ts) las carga desde `__dirname/database/migrations/*{.ts,.js}` y en
**producción** (`NODE_ENV=production`) las ejecuta automáticamente al arrancar
(`migrationsRun`). En development el esquema lo sigue manejando `synchronize`.

## Flujo tras cambiar entidades

1. Edita/agrega la entidad (`*.entity.ts`). Si es nueva, regístrala también en
   `entities` de `src/database/data-source.ts`.
2. Genera la migración (diff entidades vs DB actual):

   ```bash
   npm run migration:generate src/database/migrations/NombreDescriptivo
   ```

   Ojo: si `synchronize` ya aplicó el cambio en tu DB de dev, el diff saldrá
   vacío. En ese caso genera contra una DB limpia:

   ```powershell
   docker exec ecf_saas_postgres psql -U postgres -c "CREATE DATABASE tmp_check;"
   $env:DATABASE_NAME='tmp_check'; npm run migration:run; npm run migration:generate src/database/migrations/NombreDescriptivo
   Remove-Item Env:DATABASE_NAME; docker exec ecf_saas_postgres psql -U postgres -c "DROP DATABASE tmp_check;"
   ```

3. **Revisa siempre** el archivo generado (índices, defaults, enums, FKs, DROPs
   inesperados) antes de aplicarlo.

## Comandos

```bash
npm run migration:show      # [X] aplicadas / [ ] pendientes
npm run migration:run       # aplica las pendientes
npm run migration:revert    # deshace la última aplicada
```

## Notas

- `1783070591938-InitialSchema` crea el esquema completo desde cero (incluida la
  extensión `uuid-ossp`). En la DB de dev `ecf_saas` está marcada como aplicada
  en la tabla `migrations` sin haberse ejecutado, porque el esquema ya existía
  (creado por `synchronize`).
- Nunca edites una migración ya aplicada en otro entorno: crea una nueva.
