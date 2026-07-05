import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mueve tokenDgii/certificadoDgii de User a Empresa: el token de sesión DGII
 * debe ser compartido por todos los usuarios de la empresa, no exclusivo de
 * quien ejecutó el authenticate.
 */
export class MoveDgiiTokenToEmpresa1783213775432 implements MigrationInterface {
  name = 'MoveDgiiTokenToEmpresa1783213775432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empresas" ADD "certificadoDgii" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "empresas" ADD "tokenDgii" character varying`);

    // Conserva el token más reciente entre los usuarios admin de cada empresa.
    await queryRunner.query(`
      UPDATE "empresas" e
      SET "certificadoDgii" = u."certificadoDgii", "tokenDgii" = u."tokenDgii"
      FROM "users" u
      WHERE u."empresa_id" = e.id AND u."tokenDgii" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "certificadoDgii"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tokenDgii"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "certificadoDgii" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "tokenDgii" character varying`);

    await queryRunner.query(`
      UPDATE "users" u
      SET "certificadoDgii" = e."certificadoDgii", "tokenDgii" = e."tokenDgii"
      FROM "empresas" e
      WHERE u."empresa_id" = e.id AND e."tokenDgii" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "tokenDgii"`);
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "certificadoDgii"`);
  }
}
