import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { EcfModule } from "./ecf/ecf.module";
import { ValidationModule } from "./validation/validation.module";
import { DgiiModule } from "./dgii/dgii.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule, EcfModule, ValidationModule, DgiiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
