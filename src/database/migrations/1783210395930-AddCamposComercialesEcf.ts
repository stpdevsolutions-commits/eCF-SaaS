import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCamposComercialesEcf1783210395930 implements MigrationInterface {
    name = 'AddCamposComercialesEcf1783210395930'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ecf" ADD "direccionEmisor" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "tipoPago" integer NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "tipoIngresos" character varying(2) NOT NULL DEFAULT '01'`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "terminoPago" character varying(15)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "idExtranjeroComprador" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "telefonoComprador" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "correoComprador" character varying(320)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "direccionComprador" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "provinciaComprador" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "municipioComprador" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "comentarioComprador" character varying(150)`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "aplicaPropinaLegal" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "montoPropinaLegal" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "linea_ecf" ADD "indicadorBienoServicio" integer NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "linea_ecf" ADD "unidadMedida" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linea_ecf" DROP COLUMN "unidadMedida"`);
        await queryRunner.query(`ALTER TABLE "linea_ecf" DROP COLUMN "indicadorBienoServicio"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "montoPropinaLegal"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "aplicaPropinaLegal"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "comentarioComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "municipioComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "provinciaComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "direccionComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "correoComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "telefonoComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "idExtranjeroComprador"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "terminoPago"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "tipoIngresos"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "tipoPago"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "direccionEmisor"`);
    }

}
