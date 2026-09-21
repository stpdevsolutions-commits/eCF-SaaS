import {
  Controller,
  Post,
  Req,
  HttpCode,
  Header,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { DgiiReceptorService } from './dgii-receptor.service';

/** Forma mínima de un archivo de multer que necesitamos (evita depender de @types/multer). */
interface ArchivoSubido {
  buffer: Buffer;
}

/**
 * Endpoints públicos que la DGII invoca directamente — no llevan
 * JwtAuthGuard porque no hay sesión de usuario posible en estas llamadas.
 * Son las URL que se registran en "Mantenimiento Directorio FE" (Oficina
 * Virtual) — Recepción e-CF y Aprobación Comercial (Informe Técnico e-CF
 * v1.0, sección 5.2) — y las que ejercita el Set de Pruebas de
 * certificación de software (Pasos 9-11 del Proceso de Certificación).
 *
 * Acepta tanto multipart/form-data (como el resto de los Web Service de
 * dgii-ecf) como XML plano en el cuerpo (ver text() en main.ts).
 */
@ApiTags('DGII — Webhooks (Recepción / Aprobación)')
@Controller('dgii/webhook')
export class DgiiWebhookController {
  constructor(private receptorService: DgiiReceptorService) {}

  @Post('recepcion')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({
    summary:
      'URL Recepción e-CF: recibe un e-CF de un tercero y responde con el Acuse de Recibo (ARECF) firmado',
  })
  async recepcion(
    @UploadedFiles() files: Array<ArchivoSubido> | undefined,
    @Req() req: Request,
  ): Promise<string> {
    const xmlContent = this.extraerXml(files, req);
    return this.receptorService.procesarRecepcion(xmlContent);
  }

  @Post('aprobacion-comercial')
  @HttpCode(200)
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({
    summary:
      'URL Aprobación Comercial: recibe copia de la aprobación/rechazo comercial de un e-CF emitido por STP',
  })
  async aprobacionComercial(
    @UploadedFiles() files: Array<ArchivoSubido> | undefined,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const xmlContent = this.extraerXml(files, req);
    await this.receptorService.procesarAprobacionComercial(xmlContent);
    return { ok: true };
  }

  private extraerXml(files: Array<ArchivoSubido> | undefined, req: Request): string {
    if (files?.length) {
      return files[0].buffer.toString('utf-8');
    }
    if (typeof req.body === 'string' && req.body.length > 0) {
      return req.body;
    }
    const posible = (req.body as Record<string, unknown> | undefined)?.['xml'];
    if (typeof posible === 'string' && posible.length > 0) {
      return posible;
    }
    throw new BadRequestException(
      'No se encontró contenido XML en la petición (ni multipart ni cuerpo XML/texto)',
    );
  }
}
