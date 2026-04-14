import { Module } from "@nestjs/common";
import { EcfController } from "./controllers/ecf.controller";
import { EcfService } from "./services/ecf.service";

@Module({
  controllers: [EcfController],
  providers: [EcfService],
})
export class EcfModule {}
