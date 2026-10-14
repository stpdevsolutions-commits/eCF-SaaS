import { BadRequestException, Controller, Get, Header, HttpCode, Post, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { DgiiAutenticacionService } from './dgii-autenticacion.service';

interface ArchivoSubido {
  buffer: Buffer;
}

/**
 * Servicio URL de Autenticación (opcional en el Directorio FE) — la DGII u
 * otro emisor se autentica contra NOSOTROS. Rutas según la Descripción
 * Técnica de Facturación Electrónica (Emisor-Receptor):
 *   GET  {host}/fe/autenticacion/api/semilla
 *   POST {host}/fe/autenticacion/api/validacioncertificado   (multipart `xml`)
 * Con el prefijo global de la app, {host} = https://ecf-api.stpsoluciones.com/api
 *
 * Públicas (sin JWT) a propósito; límite propio de 30 req/min por IP.
 */
@ApiTags('DGII — Autenticación (entrante)')
@Controller('fe/autenticacion/api')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class DgiiAutenticacionController {
  constructor(private autenticacion: DgiiAutenticacionService) {}

  @Get('semilla')
  @Header('Content-Type', 'application/xml')
  @ApiOperation({ summary: 'Entrega una semilla (SemillaModel XML) para que el cliente la firme con su certificado' })
  semilla(): string {
    return this.autenticacion.generarSemilla().xml;
  }

  @Post('validacioncertificado')
  @HttpCode(200)
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Recibe la semilla firmada, valida firma y certificado y devuelve un token Bearer de vida corta' })
  validacionCertificado(
    @UploadedFiles() files: Array<ArchivoSubido> | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): unknown {
    const xml = this.extraerXml(files, req);
    const r = this.autenticacion.validarSemillaFirmada(xml);

    // La DGII documenta respuesta JSON o XML; se responde según el header Accept.
    if (req.headers.accept?.includes('xml') && !req.headers.accept.includes('json')) {
      res.type('application/xml');
      return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        `<RespuestaAutenticacion><token>${r.token}</token><expira>${r.expira}</expira><expedido>${r.expedido}</expedido></RespuestaAutenticacion>`
      );
    }
    return r;
  }

  private extraerXml(files: Array<ArchivoSubido> | undefined, req: Request): string {
    if (files?.length) return files[0].buffer.toString('utf-8');
    if (typeof req.body === 'string' && req.body.length > 0) return req.body;
    const posible = (req.body as Record<string, unknown> | undefined)?.['xml'];
    if (typeof posible === 'string' && posible.length > 0) return posible;
    throw new BadRequestException('No se encontró el XML de la semilla firmada (campo multipart "xml" o cuerpo XML)');
  }
}
