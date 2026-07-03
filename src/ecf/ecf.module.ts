import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcfController } from './controllers/ecf.controller';
import { EcfService } from './services/ecf.service';
import { EcfXmlService } from './services/ecf-xml.service';
import { EcfSigningService } from './services/ecf-signing.service';
import { NcfSequenceService } from './services/ncf-sequence.service';
import { Ecf } from './entities/ecf.entity';
import { LineaEcf } from './entities/linea-ecf.entity';
import { NcfSequence } from './entities/ncf-sequence.entity';
import { User } from '../auth/entities/user.entity';
import { ValidationModule } from '../validation/validation.module';
import { DgiiModule } from '../dgii/dgii.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ecf, LineaEcf, NcfSequence, User]),
    ValidationModule,
    DgiiModule,
  ],
  controllers: [EcfController],
  providers: [EcfService, EcfXmlService, EcfSigningService, NcfSequenceService],
  exports: [EcfService, EcfXmlService, EcfSigningService, NcfSequenceService],
})
export class EcfModule {}
