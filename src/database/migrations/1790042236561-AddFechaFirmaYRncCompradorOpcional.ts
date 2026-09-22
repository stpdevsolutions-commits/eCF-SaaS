import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFechaFirmaYRncCompradorOpcional1790042236561 implements MigrationInterface {
    name = 'AddFechaFirmaYRncCompradorOpcional1790042236561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ecf" ADD "fechaHoraFirma" TIMESTAMP`);
        // RNCComprador es minOccurs="0" en el XSD de la DGII solo para e-CF_32
        // (venta a consumidor final sin RNC/Cédula) — antes era NOT NULL para todos.
        await queryRunner.query(`ALTER TABLE "ecf" ALTER COLUMN "rncComprador" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ecf" ALTER COLUMN "rncComprador" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "fechaHoraFirma"`);
    }

}
