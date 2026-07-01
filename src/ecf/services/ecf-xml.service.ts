import { Injectable } from '@nestjs/common';
import { Ecf } from '../entities/ecf.entity';

/**
 * Mapeo de código interno → número DGII de TipoeCF.
 * El XSD TipoeCFType acepta enteros: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47.
 */
const TIPO_ECF_MAP: Record<string, number> = {
  'e-CF_31_v_1_0': 31,
  'e-CF_32_v_1_0': 32,
  'e-CF_33_v_1_0': 33,
  'e-CF_34_v_1_0': 34,
  'e-CF_41_v_1_0': 41,
  'e-CF_43_v_1_0': 43,
  'e-CF_44_v_1_0': 44,
  'e-CF_45_v_1_0': 45,
  'e-CF_46_v_1_0': 46,
  'e-CF_47_v_1_0': 47,
};

export const SCHEMA_BASEPATH = 'src/validation/schemas';

@Injectable()
export class EcfXmlService {
  /**
   * Genera el XML del comprobante (sin firma) conforme al XSD correspondiente.
   *
   * @param ecf       Entidad ECF con sus líneas cargadas (ecf.lineas debe estar populated)
   * @param secuencia Número de secuencia para el eNCF (13 chars: E + tipo(2) + seq(10))
   */
  generateXml(ecf: Ecf, secuencia = 1): string {
    const tipoNumerico = TIPO_ECF_MAP[ecf.tipoEcf];
    if (!tipoNumerico) {
      throw new Error(`Tipo ECF no soportado: "${ecf.tipoEcf}". Valores válidos: ${Object.keys(TIPO_ECF_MAP).join(', ')}`);
    }

    const eNCF = this.buildENCF(tipoNumerico, secuencia);
    const now = new Date();
    const fechaEmision = this.toFecha(ecf.fechaEmision ?? now);
    const vencimientoSecuencia = this.toFecha(this.addYears(now, 1));
    const fechaHoraFirma = this.toDateTimeLocal(now);

    // TypeORM devuelve columnas NUMERIC como strings — convertir explícitamente.
    const total = Number(ecf.montoTotal);
    const itbis = Number(ecf.montoITBIS);
    const gravado = total - itbis;

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ECF>',
      '  <Encabezado>',
      '    <Version>1.0</Version>',
      '    <IdDoc>',
      `      <TipoeCF>${tipoNumerico}</TipoeCF>`,
      `      <eNCF>${eNCF}</eNCF>`,
      `      <FechaVencimientoSecuencia>${vencimientoSecuencia}</FechaVencimientoSecuencia>`,
      // TipoIngresos: 01 = Ingresos por operaciones (No financieros)
      '      <TipoIngresos>01</TipoIngresos>',
      // TipoPago: 1 = Contado
      '      <TipoPago>1</TipoPago>',
      '    </IdDoc>',
      '    <Emisor>',
      `      <RNCEmisor>${this.esc(ecf.rncEmisor)}</RNCEmisor>`,
      `      <RazonSocialEmisor>${this.esc(ecf.nombreEmisor)}</RazonSocialEmisor>`,
      // DireccionEmisor es requerida en el XSD (minOccurs=1)
      '      <DireccionEmisor>Sin Dirección Registrada</DireccionEmisor>',
      `      <FechaEmision>${fechaEmision}</FechaEmision>`,
      '    </Emisor>',
      '    <Comprador>',
      `      <RNCComprador>${this.esc(ecf.rncComprador)}</RNCComprador>`,
      `      <RazonSocialComprador>${this.esc(ecf.nombreComprador)}</RazonSocialComprador>`,
      '    </Comprador>',
      '    <Totales>',
    ];

    if (itbis > 0) {
      // Gravado con ITBIS tasa 1 (18 %)
      lines.push(`      <MontoGravadoI1>${this.r2(gravado)}</MontoGravadoI1>`);
      lines.push('      <ITBIS1>18</ITBIS1>');
      lines.push(`      <TotalITBIS1>${this.r2(itbis)}</TotalITBIS1>`);
      lines.push(`      <TotalITBIS>${this.r2(itbis)}</TotalITBIS>`);
    } else {
      // Sin ITBIS → monto exento
      lines.push(`      <MontoExento>${this.r2(total)}</MontoExento>`);
    }

    lines.push(`      <MontoTotal>${this.r2(total)}</MontoTotal>`);
    lines.push('    </Totales>');
    lines.push('  </Encabezado>');
    lines.push('  <DetallesItems>');

    const lineas = ecf.lineas ?? [];
    lineas.forEach((linea, i) => {
      const descuento = Number(linea.descuentoLinea);
      lines.push('    <Item>');
      lines.push(`      <NumeroLinea>${i + 1}</NumeroLinea>`);
      // IndicadorFacturacion: 1 = Facturación Normal
      lines.push('      <IndicadorFacturacion>1</IndicadorFacturacion>');
      lines.push(`      <NombreItem>${this.esc(linea.descripcion)}</NombreItem>`);
      // IndicadorBienoServicio: 1 = Bien, 2 = Servicio
      lines.push('      <IndicadorBienoServicio>1</IndicadorBienoServicio>');
      lines.push(`      <CantidadItem>${Number(linea.cantidad).toFixed(2)}</CantidadItem>`);
      lines.push(`      <PrecioUnitarioItem>${Number(linea.precioUnitario).toFixed(4)}</PrecioUnitarioItem>`);
      if (descuento > 0) {
        lines.push(`      <DescuentoMonto>${this.r2(descuento)}</DescuentoMonto>`);
      }
      // MontoItem = subtotal de la línea (sin ITBIS) — requerido por XSD
      lines.push(`      <MontoItem>${this.r2(Number(linea.subtotal))}</MontoItem>`);
      lines.push('    </Item>');
    });

    lines.push('  </DetallesItems>');
    // FechaHoraFirma es requerida (minOccurs=1) y va antes del elemento xs:any (Signature)
    lines.push(`  <FechaHoraFirma>${fechaHoraFirma}</FechaHoraFirma>`);
    lines.push('</ECF>');

    return lines.join('\n');
  }

  /** Ruta al XSD correspondiente al tipo de ECF. */
  getSchemaPath(tipoEcf: string): string {
    return `${SCHEMA_BASEPATH}/${tipoEcf}.xsd`;
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Construye el eNCF de 13 caracteres:  E + tipo(2 dígitos) + secuencia(10 dígitos)
   * Ejemplo: E310000000001
   */
  private buildENCF(tipo: number, seq: number): string {
    return `E${tipo}${String(seq).padStart(10, '0')}`;
  }

  /** Formato de fecha DGII: DD-MM-YYYY */
  private toFecha(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /** Formato de fecha-hora ISO 8601 sin zona: YYYY-MM-DDTHH:MM:SS */
  private toDateTimeLocal(date: Date): string {
    return date.toISOString().split('.')[0];
  }

  private addYears(date: Date, years: number): Date {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + years);
    return d;
  }

  /** Redondea a 2 decimales y devuelve string para el XML. */
  private r2(n: number): string {
    return n.toFixed(2);
  }

  /** Escapa caracteres especiales XML en valores de texto. */
  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
