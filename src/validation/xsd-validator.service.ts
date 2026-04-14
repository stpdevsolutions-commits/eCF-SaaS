import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class XsdValidatorService {
  private schemas: Map<string, any> = new Map();

  constructor() {
    this.loadSchemas();
  }

  private loadSchemas() {
    const schemasDir = path.join(__dirname, 'schemas');
    const files = fs.readdirSync(schemasDir).filter(f => f.endsWith('.xsd'));

    for (const file of files) {
      const schemaPath = path.join(schemasDir, file);
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const key = file.replace('.xsd', '');
      this.schemas.set(key, content);
    }
  }

  validateEcf(tipoEcf: string, ecfData: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validaciones básicas obligatorias
    if (!ecfData.rncEmisor) {
      errors.push('RNC Emisor es obligatorio');
    }

    if (!ecfData.rncComprador) {
      errors.push('RNC Comprador es obligatorio');
    }

    if (!ecfData.nombreEmisor) {
      errors.push('Nombre Emisor es obligatorio');
    }

    if (!ecfData.nombreComprador) {
      errors.push('Nombre Comprador es obligatorio');
    }

    if (!ecfData.fechaEmision) {
      errors.push('Fecha Emisión es obligatoria');
    }

    if (!ecfData.lineas || ecfData.lineas.length === 0) {
      errors.push('Debe contener al menos una línea de factura');
    }

    // Validar formato RNC
    if (ecfData.rncEmisor && !this.validateRNC(ecfData.rncEmisor)) {
      errors.push('RNC Emisor inválido');
    }

    if (ecfData.rncComprador && !this.validateRNC(ecfData.rncComprador)) {
      errors.push('RNC Comprador inválido');
    }

    // Validar montos
    if (ecfData.montoTotal <= 0) {
      errors.push('Monto Total debe ser mayor a 0');
    }

    // Validar líneas
    if (ecfData.lineas) {
      ecfData.lineas.forEach((linea: any, index: number) => {
        if (!linea.descripcion) {
          errors.push(`Línea ${index + 1}: Descripción requerida`);
        }
        if (linea.cantidad <= 0) {
          errors.push(`Línea ${index + 1}: Cantidad debe ser mayor a 0`);
        }
        if (linea.precioUnitario <= 0) {
          errors.push(`Línea ${index + 1}: Precio unitario debe ser mayor a 0`);
        }
      });
    }

    // Validar tipo ECF
    const tiposValidos = [
      'e-CF_31_v_1_0',
      'e-CF_32_v_1_0',
      'e-CF_33_v_1_0',
      'e-CF_34_v_1_0',
      'e-CF_41_v_1_0',
      'e-CF_43_v_1_0',
      'e-CF_44_v_1_0',
      'e-CF_45_v_1_0',
      'e-CF_46_v_1_0',
      'e-CF_47_v_1_0',
    ];

    if (!tiposValidos.includes(tipoEcf)) {
      errors.push(`Tipo ECF inválido: ${tipoEcf}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateRNC(rnc: string): boolean {
    // RNC debe tener 9-11 dígitos
    const rncRegex = /^\d{9,11}$/;
    return rncRegex.test(rnc);
  }

  getAvailableSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  getSchemaContent(schemaName: string): string | null {
    return this.schemas.get(schemaName) || null;
  }
}
