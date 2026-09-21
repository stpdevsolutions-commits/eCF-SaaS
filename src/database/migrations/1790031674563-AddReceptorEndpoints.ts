import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceptorEndpoints1790031674563 implements MigrationInterface {
    name = 'AddReceptorEndpoints1790031674563'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ecf_aprobacioncomercial_enum" AS ENUM('pendiente', 'aceptado', 'rechazado')`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "aprobacionComercial" "public"."ecf_aprobacioncomercial_enum" NOT NULL DEFAULT 'pendiente'`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "detalleMotivoRechazoAprobacion" text`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD "fechaHoraAprobacionComercial" TIMESTAMP`);

        await queryRunner.query(`CREATE TYPE "public"."ecf_recibidos_estadoacuse_enum" AS ENUM('recibido', 'no_recibido')`);
        await queryRunner.query(`CREATE TYPE "public"."ecf_recibidos_aprobacioncomercial_enum" AS ENUM('pendiente', 'aceptado', 'rechazado')`);
        await queryRunner.query(`CREATE TABLE "ecf_recibidos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rncEmisor" character varying(20) NOT NULL, "rncComprador" character varying(20) NOT NULL, "encf" character varying(13) NOT NULL, "tipoEcf" integer, "fechaEmision" TIMESTAMP, "montoTotal" numeric(12,2), "xmlRecibido" text NOT NULL, "estadoAcuse" "public"."ecf_recibidos_estadoacuse_enum" NOT NULL, "codigoMotivoNoRecibido" character varying(1), "xmlAcuseFirmado" text, "fechaHoraAcuse" TIMESTAMP NOT NULL, "aprobacionComercial" "public"."ecf_recibidos_aprobacioncomercial_enum" NOT NULL DEFAULT 'pendiente', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ecf_recibidos_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ecf_recibidos_rncEmisor" ON "ecf_recibidos" ("rncEmisor") `);
        await queryRunner.query(`CREATE INDEX "IDX_ecf_recibidos_encf" ON "ecf_recibidos" ("encf") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_ecf_recibidos_encf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ecf_recibidos_rncEmisor"`);
        await queryRunner.query(`DROP TABLE "ecf_recibidos"`);
        await queryRunner.query(`DROP TYPE "public"."ecf_recibidos_aprobacioncomercial_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ecf_recibidos_estadoacuse_enum"`);

        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "fechaHoraAprobacionComercial"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "detalleMotivoRechazoAprobacion"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "aprobacionComercial"`);
        await queryRunner.query(`DROP TYPE "public"."ecf_aprobacioncomercial_enum"`);
    }

}
