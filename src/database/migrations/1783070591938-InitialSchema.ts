import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783070591938 implements MigrationInterface {
    name = 'InitialSchema1783070591938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Requerida por los defaults uuid_generate_v4() (en dev la instaló synchronize)
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."empresas_tipocontribuyente_enum" AS ENUM('regimen_ordinario', 'regimen_simplificado', 'monotributo')`);
        await queryRunner.query(`CREATE TABLE "empresas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rnc" character varying(20) NOT NULL, "razonSocial" character varying(255) NOT NULL, "nombreComercial" character varying(255), "direccion" character varying(255), "telefono" character varying(50), "tipoContribuyente" "public"."empresas_tipocontribuyente_enum" NOT NULL DEFAULT 'regimen_ordinario', "activo" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_12b1837a51e113fe7d668c106ca" UNIQUE ("rnc"), CONSTRAINT "PK_ce7b122b37c6499bfd6520873e1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_12b1837a51e113fe7d668c106c" ON "empresas" ("rnc") `);
        await queryRunner.query(`CREATE TABLE "linea_ecf" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero" integer NOT NULL, "descripcion" character varying(255) NOT NULL, "cantidad" integer NOT NULL, "precioUnitario" numeric(12,2) NOT NULL, "descuentoLinea" numeric(12,2) NOT NULL DEFAULT '0', "subtotal" numeric(12,2) NOT NULL, "itbis" numeric(12,2) NOT NULL DEFAULT '0', "indicadorAgenteRetencionoPercepcion" integer, "montoItbisRetenido" numeric(12,2), "montoIsrRetenido" numeric(12,2), "ecf_id" uuid, CONSTRAINT "PK_cb0fde4042e1965cf1015c8b5e3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ecf_estado_enum" AS ENUM('draft', 'validated', 'signed', 'transmitted', 'accepted', 'rejected', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "ecf" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tipoEcf" character varying(20) NOT NULL, "version" character varying(10) NOT NULL DEFAULT 'v1.0', "encf" character varying(13), "fechaEmision" TIMESTAMP NOT NULL, "rncEmisor" character varying(20) NOT NULL, "nombreEmisor" character varying(255) NOT NULL, "rncComprador" character varying(20) NOT NULL, "nombreComprador" character varying(255) NOT NULL, "estado" "public"."ecf_estado_enum" NOT NULL DEFAULT 'draft', "montoTotal" numeric(12,2) NOT NULL, "montoDescuento" numeric(12,2) NOT NULL DEFAULT '0', "montoITBIS" numeric(12,2) NOT NULL DEFAULT '0', "montoItbisRetenido" numeric(12,2) NOT NULL DEFAULT '0', "montoRentaRetenido" numeric(12,2) NOT NULL DEFAULT '0', "moneda" character varying(3) NOT NULL DEFAULT 'RD', "uuid" character varying, "codigoSeguridadDgii" character varying, "xmlFirmado" text, "xmlValidacion" text, "empresa_id" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "usuario_id" uuid, CONSTRAINT "PK_11edb13fbe7c114d593f7147f8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_aa4f652e35bb9eb0efb6ca9f26" ON "ecf" ("encf") `);
        await queryRunner.query(`CREATE INDEX "IDX_d9d0c56d0f3c91dd141589f7f2" ON "ecf" ("fechaEmision") `);
        await queryRunner.query(`CREATE INDEX "IDX_6711ad1c02fa31f995852f465a" ON "ecf" ("estado") `);
        await queryRunner.query(`CREATE INDEX "IDX_37054869cfbed04112fcb40206" ON "ecf" ("rncComprador") `);
        await queryRunner.query(`CREATE INDEX "IDX_8696ab81605859ca95dbf45ee1" ON "ecf" ("rncEmisor") `);
        await queryRunner.query(`CREATE INDEX "IDX_e55fceff6c953623ee85509844" ON "ecf" ("empresa_id") `);
        await queryRunner.query(`CREATE TYPE "public"."users_rol_enum" AS ENUM('admin', 'member')`);
        await queryRunner.query(`CREATE TYPE "public"."users_tipopersona_enum" AS ENUM('fisica', 'juridica')`);
        await queryRunner.query(`CREATE TYPE "public"."users_tipocontribuyente_enum" AS ENUM('regimen_ordinario', 'regimen_simplificado', 'monotributo')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying NOT NULL, "numeroRegistro" character varying(20), "empresa_id" uuid, "rol" "public"."users_rol_enum" NOT NULL DEFAULT 'admin', "tipoPersona" "public"."users_tipopersona_enum" NOT NULL DEFAULT 'juridica', "tipoContribuyente" "public"."users_tipocontribuyente_enum" NOT NULL DEFAULT 'regimen_ordinario', "razonSocial" character varying(255), "direccion" character varying(255), "telefono" character varying(50), "activo" boolean NOT NULL DEFAULT true, "certificadoDgii" boolean NOT NULL DEFAULT false, "tokenDgii" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_d63f5fa7c8515363ca466ef2eae" UNIQUE ("numeroRegistro"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d63f5fa7c8515363ca466ef2ea" ON "users" ("numeroRegistro") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "ncf_sequence" ("empresa_id" uuid NOT NULL, "tipo_ecf" character varying(20) NOT NULL, "ultima_secuencia" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_c69f9cacc7702741cb9bb4ee728" PRIMARY KEY ("empresa_id", "tipo_ecf"))`);
        await queryRunner.query(`ALTER TABLE "linea_ecf" ADD CONSTRAINT "FK_9afde896085d6cd82b369e65aba" FOREIGN KEY ("ecf_id") REFERENCES "ecf"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD CONSTRAINT "FK_e55fceff6c953623ee855098444" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ecf" ADD CONSTRAINT "FK_8352052fc9d8594d7da4c691775" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_47392add05643b67732b121fd13" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_47392add05643b67732b121fd13"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP CONSTRAINT "FK_8352052fc9d8594d7da4c691775"`);
        await queryRunner.query(`ALTER TABLE "ecf" DROP CONSTRAINT "FK_e55fceff6c953623ee855098444"`);
        await queryRunner.query(`ALTER TABLE "linea_ecf" DROP CONSTRAINT "FK_9afde896085d6cd82b369e65aba"`);
        await queryRunner.query(`DROP TABLE "ncf_sequence"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d63f5fa7c8515363ca466ef2ea"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_tipocontribuyente_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_tipopersona_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_rol_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e55fceff6c953623ee85509844"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8696ab81605859ca95dbf45ee1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_37054869cfbed04112fcb40206"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6711ad1c02fa31f995852f465a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d9d0c56d0f3c91dd141589f7f2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa4f652e35bb9eb0efb6ca9f26"`);
        await queryRunner.query(`DROP TABLE "ecf"`);
        await queryRunner.query(`DROP TYPE "public"."ecf_estado_enum"`);
        await queryRunner.query(`DROP TABLE "linea_ecf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_12b1837a51e113fe7d668c106c"`);
        await queryRunner.query(`DROP TABLE "empresas"`);
        await queryRunner.query(`DROP TYPE "public"."empresas_tipocontribuyente_enum"`);
    }

}
