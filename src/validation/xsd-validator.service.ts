import { Injectable } from '@nestjs/common';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class XsdValidatorService {
  validateEcf(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validación de RNC
    if (!data.rncEmisor || !/^\d{9,11}$/.test(data.rncEmisor)) {
      errors.push('RNC Emisor inválido (debe ser 9-11 dígitos)');
    }

    if (!data.rncComprador || !/^\d{9,11}$/.test(data.rncComprador)) {
      errors.push('RNC Comprador inválido (debe ser 9-11 dígitos)');
    }

    // Validación de tipo ECF
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

    if (!data.tipoEcf || !tiposValidos.includes(data.tipoEcf)) {
      errors.push(`Tipo ECF inválido. Válidos: ${tiposValidos.join(', ')}`);
    }

    // Validación de montos
    if (data.montoTotal !== undefined && data.montoTotal < 0) {
      errors.push('Monto total no puede ser negativo');
    }

    // Validación de líneas
    if (!data.lineas || data.lineas.length === 0) {
      errors.push('Debe haber al menos una línea en el comprobante');
    }

    if (data.lineas) {
      data.lineas.forEach((linea: any, index: number) => {
        if (!linea.descripcion) {
          errors.push(`Línea ${index + 1}: Descripción requerida`);
        }
        if (!linea.cantidad || linea.cantidad <= 0) {
          errors.push(`Línea ${index + 1}: Cantidad debe ser mayor a 0`);
        }
        if (!linea.precioUnitario || linea.precioUnitario < 0) {
          errors.push(`Línea ${index + 1}: Precio unitario inválido`);
        }
      });
    }

    // Campos requeridos
    if (!data.nombreEmisor) {
      errors.push('Nombre Emisor requerido');
    }

    if (!data.nombreComprador) {
      errors.push('Nombre Comprador requerido');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  calculateITBIS(montoSubtotal: number, rate: number = 0.18): number {
    return Math.round(montoSubtotal * rate * 100) / 100;
  }

  calculateLineTotal(
    cantidad: number,
    precioUnitario: number,
    descuento: number = 0,
  ): { subtotal: number; itbis: number; total: number } {
    const subtotal = cantidad * precioUnitario - descuento;
    const itbis = this.calculateITBIS(subtotal);
    const total = subtotal + itbis;

    return {
      subtotal,
      itbis,
      total,
    };
  }
}
