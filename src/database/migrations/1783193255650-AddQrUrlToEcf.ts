import { MigrationInterface, QueryRunner } from "typeorm";

export class AddQrUrlToEcf1783193255650 implements MigrationInterface {
    name = 'AddQrUrlToEcf1783193255650'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ecf" ADD "qrUrl" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ecf" DROP COLUMN "qrUrl"`);
    }

}
