import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - ecf: fecha límite de pago (ventas a crédito) y referencia al comprobante modificado
 *   (notas de crédito/débito).
 * - ncf_sequence: vencimiento de la secuencia eNCF autorizada, que el XSD exige en IdDoc
 *   (<FechaVencimientoSecuencia>) para los e-CF 31, 33, 41, 43, 44, 45, 46 y 47.
 */
export class AddCreditoYReferenciaEcf1790100000000 implements MigrationInterface {
  name = 'AddCreditoYReferenciaEcf1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ecf" ADD "fechaLimitePago" date`);
    await queryRunner.query(`ALTER TABLE "ecf" ADD "ncfModificado" character varying(19)`);
    await queryRunner.query(`ALTER TABLE "ecf" ADD "fechaNcfModificado" date`);
    await queryRunner.query(`ALTER TABLE "ecf" ADD "codigoModificacion" integer`);
    await queryRunner.query(`ALTER TABLE "ecf" ADD "razonModificacion" character varying(90)`);
    await queryRunner.query(`ALTER TABLE "ncf_sequence" ADD "fecha_vencimiento" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ncf_sequence" DROP COLUMN "fecha_vencimiento"`);
    await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "razonModificacion"`);
    await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "codigoModificacion"`);
    await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "fechaNcfModificado"`);
    await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "ncfModificado"`);
    await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "fechaLimitePago"`);
  }
}
