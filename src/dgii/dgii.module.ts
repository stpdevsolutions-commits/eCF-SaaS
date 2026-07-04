import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DgiiService } from './dgii.service';
import { DgiiCertificateService } from './dgii-certificate.service';
import { DgiiController } from './dgii.controller';
import { Ecf } from '../ecf/entities/ecf.entity';
import { User } from '../auth/entities/user.entity';
import { EcfAnulacionService } from '../ecf/services/ecf-anulacion.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

// Nota: EcfSigningService también se provee en EcfModule (que importa
// DgiiModule). Se registra aquí también —como instancia separada, con su
// propia caché de certificado/firma— para que DgiiService pueda firmar el
// ANECF sin crear una dependencia circular EcfModule <-> DgiiModule.
@Module({
  imports: [TypeOrmModule.forFeature([Ecf, User])],
  controllers: [DgiiController],
  providers: [DgiiService, DgiiCertificateService, EcfAnulacionService, EcfSigningService],
  exports: [DgiiService, DgiiCertificateService],
})
export class DgiiModule {}
