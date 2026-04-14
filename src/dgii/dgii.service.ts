import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ecf } from '../ecf/entities/ecf.entity';

interface DgiiAuthResponse {
  token: string;
  expiresIn: number;
}

interface DgiiTransmitResponse {
  uuid: string;
  codigo: string;
  mensajes: string[];
}

@Injectable()
export class DgiiService {
  private dgiiBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.dgiiBaseUrl = this.configService.get<string>('DGII_API_URL') ||
      'https://ecf.dgii.gov.do/testecf/autenticacion';
  }

  async authenticate(rncEmisor: string, usuario: string, clave: string): Promise<DgiiAuthResponse> {
    try {
      // En desarrollo, retornar token mock
      if (this.configService.get('NODE_ENV') === 'development') {
        return {
          token: `mock-token-${Date.now()}`,
          expiresIn: 3600,
        };
      }

      // En producción, hacer request a DGII
      const response = await fetch(`${this.dgiiBaseUrl}/api/autenticacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rncEmisor,
          usuario,
          clave,
        }),
      });

      if (!response.ok) {
        throw new HttpException(
          'Error de autenticación con DGII',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const data = (await response.json()) as DgiiAuthResponse;
      return data;
    } catch (error) {
      throw new HttpException(
        'Error conectando con DGII',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async transmitEcf(ecf: Ecf, token: string): Promise<DgiiTransmitResponse> {
    try {
      // En desarrollo, retornar respuesta mock
      if (this.configService.get('NODE_ENV') === 'development') {
        return {
          uuid: `${Date.now()}-mock`,
          codigo: '200',
          mensajes: ['Comprobante aceptado por DGII (mock)'],
        };
      }

      // En producción, hacer request a DGII
      const response = await fetch(`${this.dgiiBaseUrl}/api/transmisiones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipoEcf: ecf.tipoEcf,
          xmlFirmado: ecf.xmlFirmado,
          rncEmisor: ecf.rncEmisor,
        }),
      });

      if (!response.ok) {
        throw new HttpException(
          'Error transmitiendo a DGII',
          HttpStatus.BAD_REQUEST,
        );
      }

      return (await response.json()) as DgiiTransmitResponse;
    } catch (error) {
      throw new HttpException(
        'Error en transmisión a DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async queryEcfStatus(uuid: string, token: string): Promise<any> {
    try {
      // En desarrollo, retornar estado mock
      if (this.configService.get('NODE_ENV') === 'development') {
        return {
          uuid,
          estado: 'Aceptado',
          codigo: '200',
          mensaje: 'Comprobante aceptado (mock)',
        };
      }

      // En producción, hacer request a DGII
      const response = await fetch(
        `${this.dgiiBaseUrl}/api/comprobantes/${uuid}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new HttpException(
          'Error consultando estado en DGII',
          HttpStatus.NOT_FOUND,
        );
      }

      return await response.json();
    } catch (error) {
      throw new HttpException(
        'Error consultando DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelEcf(uuid: string, motivo: string, token: string): Promise<any> {
    try {
      // En desarrollo, retornar respuesta mock
      if (this.configService.get('NODE_ENV') === 'development') {
        return {
          uuid,
          estado: 'Cancelado',
          motivo,
          codigo: '200',
          mensaje: 'Comprobante cancelado (mock)',
        };
      }

      // En producción, hacer request a DGII
      const response = await fetch(
        `${this.dgiiBaseUrl}/api/comprobantes/${uuid}/cancelar`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ motivo }),
        },
      );

      if (!response.ok) {
        throw new HttpException(
          'Error cancelando en DGII',
          HttpStatus.BAD_REQUEST,
        );
      }

      return await response.json();
    } catch (error) {
      throw new HttpException(
        'Error en cancelación DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
