import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ECF, { ENVIRONMENT, setAuthToken } from 'dgii-ecf';
import { Ecf } from '../ecf/entities/ecf.entity';
import { DgiiCertificateService } from './dgii-certificate.service';

export interface DgiiAuthResponse {
  token: string;
  expiresIn: number;
}

interface DgiiTransmitResponse {
  uuid: string;
  codigo: string;
  mensajes: string[];
}

/**
 * Integración con la DGII (semilla → firma → token, transmisión, consulta de
 * estado). Cuando hay certificado P12 real configurado (ver
 * DgiiCertificateService), usa la librería `dgii-ecf` contra el ambiente
 * indicado por DGII_ENVIRONMENT (TesteCF/CerteCF/eCF). Sin certificado real
 * (dev por defecto), responde con datos simulados — mismo contrato, para no
 * requerir credenciales en desarrollo.
 *
 * La anulación de rangos (ANECF) NO está implementada en modo real: requiere
 * un generador de XML de anulación para el que aún no tenemos el XSD. Es lo
 * único pendiente además de las credenciales — ver cancelEcf().
 */
@Injectable()
export class DgiiService {
  private readonly logger = new Logger(DgiiService.name);
  private clientPromise?: Promise<ECF>;

  constructor(
    private configService: ConfigService,
    private certificateService: DgiiCertificateService,
  ) {}

  async authenticate(
    _rncEmisor: string,
    _usuario: string,
    _clave: string,
  ): Promise<DgiiAuthResponse> {
    // El e-CF de la DGII se autentica con el certificado (semilla firmada),
    // no con usuario/clave — se conservan los parámetros por compatibilidad
    // con el controlador/frontend existentes.
    if (!(await this.modoReal())) {
      return {
        token: `mock-token-${Date.now()}`,
        expiresIn: 3600,
      };
    }

    try {
      const client = await this.getClient();
      const tokenData = await client.authenticate();
      if (!tokenData) {
        throw new HttpException(
          'La DGII no devolvió un token de autenticación',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const expiresIn = Math.max(
        0,
        Math.round((new Date(tokenData.expira).getTime() - Date.now()) / 1000),
      );
      return { token: tokenData.token, expiresIn };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error autenticando con DGII: ${error}`);
      throw new HttpException(
        'Error autenticando con DGII',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async transmitEcf(ecf: Ecf, token: string): Promise<DgiiTransmitResponse> {
    if (!(await this.modoReal())) {
      return {
        uuid: `${Date.now()}-mock`,
        codigo: '200',
        mensajes: ['Comprobante aceptado por DGII (mock)'],
      };
    }

    if (!ecf.xmlFirmado || !ecf.encf) {
      throw new HttpException(
        'El comprobante no tiene XML firmado o eNCF asignado',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      setAuthToken(token);
      const client = await this.getClient();
      const fileName = `${ecf.rncEmisor}${ecf.encf}.xml`;
      const respuesta = await client.sendElectronicDocument(ecf.xmlFirmado, fileName);

      if (!respuesta?.trackId) {
        throw new HttpException(
          respuesta?.error ?? 'La DGII no devolvió un trackId de transmisión',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        uuid: respuesta.trackId,
        codigo: '0',
        mensajes: (respuesta.mensajes ?? []).map((m) => m.valor),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error transmitiendo a DGII: ${error}`);
      throw new HttpException(
        'Error en transmisión a DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async queryEcfStatus(uuid: string, token: string): Promise<any> {
    if (!(await this.modoReal())) {
      return {
        uuid,
        estado: 'Aceptado',
        codigo: '200',
        mensaje: 'Comprobante aceptado (mock)',
      };
    }

    try {
      setAuthToken(token);
      const client = await this.getClient();
      const resultado = await client.statusTrackId(uuid);
      if (!resultado) {
        throw new HttpException(
          'La DGII no devolvió estado para este trackId',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        uuid,
        estado: resultado.estado,
        codigo: String(resultado.codigo),
        mensaje: (resultado.mensajes ?? []).map((m) => m.valor).join('; ') || resultado.estado,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error consultando estado en DGII: ${error}`);
      throw new HttpException(
        'Error consultando DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelEcf(uuid: string, motivo: string, token: string): Promise<any> {
    if (!(await this.modoReal())) {
      return {
        uuid,
        estado: 'Cancelado',
        motivo,
        codigo: '200',
        mensaje: 'Comprobante cancelado (mock)',
      };
    }

    // La anulación real requiere enviar un XML de solicitud (ANECF) firmado
    // con los rangos de eNCF a anular; aún no tenemos el XSD de ese documento
    // ni un generador para él (ver src/validation/schemas). Es trabajo
    // adicional a las credenciales, no bloqueado por ellas.
    void token;
    throw new HttpException(
      'Anulación real de e-CF (ANECF) aún no implementada: falta el generador de XML de anulación de rangos. ' +
        'Autenticación, transmisión y consulta de estado ya usan la DGII real.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  // ── Cliente DGII (dgii-ecf) ──────────────────────────────────────────────────

  private async modoReal(): Promise<boolean> {
    return this.certificateService.usaCertificadoReal();
  }

  private getClient(): Promise<ECF> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const p12ReaderData = await this.certificateService.getP12ReaderData();
        const environment =
          (this.configService.get<string>('DGII_ENVIRONMENT') as ENVIRONMENT) ||
          ENVIRONMENT.DEV;
        return new ECF(p12ReaderData, environment);
      })();
    }
    return this.clientPromise;
  }
}
