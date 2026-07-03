/**
 * DataSource para la CLI de TypeORM (migraciones).
 *
 * Este archivo NO lo usa la aplicación NestJS (esa configura TypeORM en
 * app.module.ts vía ConfigService); es exclusivamente la fuente de conexión
 * para los comandos `npm run migration:*`.
 *
 * Flujo de trabajo (ver también src/database/migrations/README.md):
 *
 *   1. Cambia/agrega entidades (*.entity.ts).
 *   2. Genera la migración con el diff entidades-vs-DB:
 *        npm run migration:generate src/database/migrations/NombreDescriptivo
 *   3. Revisa el archivo generado (¡siempre!).
 *   4. Aplícala:            npm run migration:run
 *      Estado:              npm run migration:show
 *      Deshacer la última:  npm run migration:revert
 *
 * La conexión se toma de .env (DATABASE_HOST/PORT/USER/PASSWORD/NAME).
 * Cualquier variable puede sobrescribirse por entorno, p. ej. para apuntar
 * a una DB temporal:
 *   $env:DATABASE_NAME = 'otra_db'; npm run migration:run   (PowerShell)
 *   DATABASE_NAME=otra_db npm run migration:run             (bash)
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { Ecf } from '../ecf/entities/ecf.entity';
import { LineaEcf } from '../ecf/entities/linea-ecf.entity';
import { NcfSequence } from '../ecf/entities/ncf-sequence.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'ecf_saas',
  // TODAS las entidades del proyecto (mantener sincronizado al agregar nuevas)
  entities: [User, Empresa, Ecf, LineaEcf, NcfSequence],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
