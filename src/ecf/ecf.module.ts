import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcfController } from './controllers/ecf.controller';
import { EcfService } from './services/ecf.service';
import { EcfXmlService } from './services/ecf-xml.service';
import { EcfSigningService } from './services/ecf-signing.service';
import { Ecf } from './entities/ecf.entity';
import { LineaEcf } from './entities/linea-ecf.entity';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ecf, LineaEcf]),
    ValidationModule,
  ],
  controllers: [EcfController],
  providers: [EcfService, EcfXmlService, EcfSigningService],
  exports: [EcfService, EcfXmlService, EcfSigningService],
})
export class EcfModule {}
