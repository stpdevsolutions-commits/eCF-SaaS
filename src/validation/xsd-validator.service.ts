import { Injectable } from '@nestjs/common';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Servicio de validación de comprobantes fiscales electrónicos (e-CF).
 *
 * Ofrece dos niveles de validación:
 *  1. validateEcf()            — Validación de campos del DTO/entidad (antes de generar XML)
 *  2. validateXmlStructure()   — Validación estructural del XML generado contra los
 *                                elementos requeridos por el XSD e-CF correspondiente
 */
@Injectable()
export class XsdValidatorService {

  // ── Validación de entidad / DTO ─────────────────────────────────────────────

  validateEcf(data: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data['rncEmisor'] || !/^\d{9,11}$/.test(String(data['rncEmisor']))) {
      errors.push('RNC Emisor inválido (debe ser 9-11 dígitos)');
    }

    if (!data['rncComprador'] || !/^\d{9,11}$/.test(String(data['rncComprador']))) {
      errors.push('RNC Comprador inválido (debe ser 9-11 dígitos)');
    }

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

    if (!data['tipoEcf'] || !tiposValidos.includes(String(data['tipoEcf']))) {
      errors.push(`Tipo ECF inválido. Válidos: ${tiposValidos.join(', ')}`);
    }

    if (data['montoTotal'] !== undefined && Number(data['montoTotal']) < 0) {
      errors.push('Monto total no puede ser negativo');
    }

    const lineas = data['lineas'] as Array<Record<string, unknown>> | undefined;

    if (!lineas || lineas.length === 0) {
      errors.push('Debe haber al menos una línea en el comprobante');
    }

    // e-CF_41 (Comprobante de Compras) exige el bloque Retencion en cada línea (XSD minOccurs=1)
    const requiereRetencion = data['tipoEcf'] === 'e-CF_41_v_1_0';

    if (lineas) {
      lineas.forEach((linea, index) => {
        if (!linea['descripcion']) {
          errors.push(`Línea ${index + 1}: Descripción requerida`);
        }
        if (!linea['cantidad'] || Number(linea['cantidad']) <= 0) {
          errors.push(`Línea ${index + 1}: Cantidad debe ser mayor a 0`);
        }
        if (linea['precioUnitario'] === undefined || Number(linea['precioUnitario']) < 0) {
          errors.push(`Línea ${index + 1}: Precio unitario inválido`);
        }
        if (requiereRetencion && !linea['indicadorAgenteRetencionoPercepcion']) {
          errors.push(
            `Línea ${index + 1}: e-CF_41 requiere indicadorAgenteRetencionoPercepcion (1=Retención, 2=Percepción)`,
          );
        }
      });
    }

    if (!data['nombreEmisor']) {
      errors.push('Nombre Emisor requerido');
    }

    if (!data['nombreComprador']) {
      errors.push('Nombre Comprador requerido');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ── Validación estructural del XML generado ─────────────────────────────────

  /**
   * Valida la estructura del XML generado contra los elementos requeridos
   * por el XSD e-CF correspondiente (sin dependencias de parseo nativo).
   *
   * Comprueba:
   *  - Elemento raíz <ECF>
   *  - Presencia de todos los elementos con minOccurs=1 en el XSD
   *  - Formato del eNCF (13 chars alfanuméricos)
   *  - Formato de FechaHoraFirma (ISO 8601 sin zona)
   *  - RNC Emisor y Comprador (9-11 dígitos)
   *  - Al menos un <Item> con sus campos requeridos
   *  - Coherencia del MontoTotal (debe ser > 0)
   *
   * @param xml     XML completo del comprobante (firmado o sin firmar)
   * @param tipoEcf Código del tipo, p.ej. "e-CF_31_v_1_0"
   */
  validateXmlStructure(xml: string, tipoEcf?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ── 1. Elemento raíz ──────────────────────────────────────────────────────
    if (!/<ECF[\s>]/.test(xml) && !xml.includes('<ECF>')) {
      errors.push('Elemento raíz <ECF> ausente');
      return { valid: false, errors, warnings };
    }

    // ── 2. Elementos requeridos (minOccurs=1 en el XSD) ──────────────────────
    const required: [string, string][] = [
      ['<Encabezado>', 'Encabezado'],
      ['<Version>', 'Version'],
      ['<IdDoc>', 'IdDoc'],
      ['<TipoeCF>', 'TipoeCF'],
      ['<eNCF>', 'eNCF'],
      ['<TipoIngresos>', 'TipoIngresos'],
      ['<TipoPago>', 'TipoPago'],
      ['<Emisor>', 'Emisor'],
      ['<RNCEmisor>', 'RNCEmisor'],
      ['<RazonSocialEmisor>', 'RazonSocialEmisor'],
      ['<DireccionEmisor>', 'DireccionEmisor'],
      ['<FechaEmision>', 'FechaEmision'],
      ['<Comprador>', 'Comprador'],
      ['<RNCComprador>', 'RNCComprador'],
      ['<RazonSocialComprador>', 'RazonSocialComprador'],
      ['<Totales>', 'Totales'],
      ['<MontoTotal>', 'MontoTotal'],
      ['<DetallesItems>', 'DetallesItems'],
      ['<Item>', 'Item'],
      ['<NumeroLinea>', 'NumeroLinea'],
      ['<NombreItem>', 'NombreItem'],
      ['<IndicadorFacturacion>', 'IndicadorFacturacion'],
      ['<IndicadorBienoServicio>', 'IndicadorBienoServicio'],
      ['<CantidadItem>', 'CantidadItem'],
      ['<PrecioUnitarioItem>', 'PrecioUnitarioItem'],
      ['<MontoItem>', 'MontoItem'],
      ['<FechaHoraFirma>', 'FechaHoraFirma'],
    ];

    for (const [tag, name] of required) {
      if (!xml.includes(tag)) {
        errors.push(`Elemento requerido ausente: <${name}>`);
      }
    }

    // ── 3. Formato eNCF (13 alfanuméricos: E + tipo(2) + seq(10)) ─────────────
    const eNCFMatch = xml.match(/<eNCF>([A-Za-z0-9]+)<\/eNCF>/);
    if (eNCFMatch) {
      if (eNCFMatch[1].length !== 13) {
        errors.push(`eNCF debe tener exactamente 13 caracteres (tiene ${eNCFMatch[1].length}): "${eNCFMatch[1]}"`);
      }
    }

    // ── 4. Formato FechaHoraFirma ─────────────────────────────────────────────
    // Formato exigido por el XSD real de la DGII (DateTimeValidationType):
    // DD-MM-YYYY HH:MM:SS — no ISO 8601 (confirmado contra TesteCF real).
    const fechaHoraMatch = xml.match(
      /<FechaHoraFirma>(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})<\/FechaHoraFirma>/,
    );
    if (!fechaHoraMatch && xml.includes('<FechaHoraFirma>')) {
      errors.push('FechaHoraFirma debe tener formato DD-MM-YYYY HH:MM:SS');
    }

    // ── 5. RNC Emisor ─────────────────────────────────────────────────────────
    const rncEmisorMatch = xml.match(/<RNCEmisor>(\d+)<\/RNCEmisor>/);
    if (rncEmisorMatch && !/^\d{9,11}$/.test(rncEmisorMatch[1])) {
      errors.push(`RNCEmisor inválido: "${rncEmisorMatch[1]}" (debe ser 9-11 dígitos)`);
    }

    // ── 6. RNC Comprador ──────────────────────────────────────────────────────
    const rncCompradorMatch = xml.match(/<RNCComprador>(\d+)<\/RNCComprador>/);
    if (rncCompradorMatch && !/^\d{9,11}$/.test(rncCompradorMatch[1])) {
      errors.push(`RNCComprador inválido: "${rncCompradorMatch[1]}" (debe ser 9-11 dígitos)`);
    }

    // ── 7. MontoTotal > 0 ─────────────────────────────────────────────────────
    const montoMatch = xml.match(/<MontoTotal>([\d.]+)<\/MontoTotal>/);
    if (montoMatch) {
      const monto = parseFloat(montoMatch[1]);
      if (isNaN(monto) || monto <= 0) {
        errors.push(`MontoTotal debe ser mayor a 0, encontrado: "${montoMatch[1]}"`);
      }
    }

    // ── 8. TipoeCF coherente con tipoEcf proporcionado ───────────────────────
    if (tipoEcf) {
      const tipoMatch = xml.match(/<TipoeCF>(\d+)<\/TipoeCF>/);
      if (tipoMatch) {
        const tipoEnXsd = tipoEcf.replace('e-CF_', '').replace('_v_1_0', '');
        if (tipoMatch[1] !== tipoEnXsd) {
          warnings.push(
            `TipoeCF en XML (${tipoMatch[1]}) no coincide con el tipo esperado (${tipoEnXsd})`,
          );
        }
      }
    }

    // ── 9. Presencia de firma digital ─────────────────────────────────────────
    if (!xml.includes('<ds:Signature') && !xml.includes('<Signature')) {
      warnings.push('El XML no contiene firma digital (XMLDSig). Usar POST /:id/sign antes de transmitir.');
    }

    // ── 10. Retencion requerida en e-CF_41 (XSD: minOccurs=1 por Item) ───────
    if (tipoEcf === 'e-CF_41_v_1_0') {
      const itemBlocks = xml.match(/<Item>[\s\S]*?<\/Item>/g) ?? [];
      itemBlocks.forEach((item, i) => {
        if (!item.includes('<Retencion>')) {
          errors.push(`e-CF_41 requiere <Retencion> en el Item ${i + 1}`);
        }
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ── Utilidades de cálculo ───────────────────────────────────────────────────

  calculateITBIS(montoSubtotal: number, rate = 0.18): number {
    return Math.round(montoSubtotal * rate * 100) / 100;
  }

  calculateLineTotal(
    cantidad: number,
    precioUnitario: number,
    descuento = 0,
    tasaItbis = 0.18,
  ): { subtotal: number; itbis: number; total: number } {
    const subtotal = cantidad * precioUnitario - descuento;
    const itbis = this.calculateITBIS(subtotal, tasaItbis);
    const total = subtotal + itbis;
    return { subtotal, itbis, total };
  }
}
