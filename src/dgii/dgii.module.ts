import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DgiiService } from './dgii.service';
import { DgiiCertificateService } from './dgii-certificate.service';
import { DgiiController } from './dgii.controller';
import { DgiiReceptorService } from './dgii-receptor.service';
import { DgiiWebhookController } from './dgii-webhook.controller';
import { Ecf } from '../ecf/entities/ecf.entity';
import { EcfRecibido } from '../ecf/entities/ecf-recibido.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { EcfAnulacionService } from '../ecf/services/ecf-anulacion.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

// Nota: EcfSigningService también se provee en EcfModule (que importa
// DgiiModule). Se registra aquí también —como instancia separada, con su
// propia caché de certificado/firma— para que DgiiService pueda firmar el
// ANECF sin crear una dependencia circular EcfModule <-> DgiiModule.
@Module({
  imports: [TypeOrmModule.forFeature([Ecf, EcfRecibido, Empresa])],
  controllers: [DgiiController, DgiiWebhookController],
  providers: [
    DgiiService,
    DgiiCertificateService,
    EcfAnulacionService,
    EcfSigningService,
    DgiiReceptorService,
  ],
  exports: [DgiiService, DgiiCertificateService],
})
export class DgiiModule {}
