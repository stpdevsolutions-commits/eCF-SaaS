import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el IndicadorFacturacion por línea (XSD IndicadorFacturacionType):
 * permite elegir la tasa de ITBIS (18%/16%/0%/Exento) en vez de asumir
 * siempre 18%.
 */
export class AddIndicadorFacturacionToLineaEcf1783214878530 implements MigrationInterface {
  name = 'AddIndicadorFacturacionToLineaEcf1783214878530';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "linea_ecf" ADD "indicadorFacturacion" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "linea_ecf" DROP COLUMN "indicadorFacturacion"`);
  }
}
