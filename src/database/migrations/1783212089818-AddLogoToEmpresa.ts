import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLogoToEmpresa1783212089818 implements MigrationInterface {
    name = 'AddLogoToEmpresa1783212089818'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "empresas" ADD "logoBase64" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "logoBase64"`);
    }

}
