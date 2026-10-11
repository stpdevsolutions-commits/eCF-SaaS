import { Injectable } from '@nestjs/common';
import { Ecf } from '../entities/ecf.entity';

/**
 * Mapeo de código interno → número DGII de TipoeCF.
 * El XSD TipoeCFType acepta enteros: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47.
 */
export const TIPO_ECF_MAP: Record<string, number> = {
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

/**
 * Tipos cuyo XSD exige <FechaVencimientoSecuencia> en IdDoc (vencimiento de la
 * secuencia de eNCF autorizada por la DGII). El 32 y el 34 no la llevan.
 */
export const TIPOS_CON_VENCIMIENTO_SECUENCIA = new Set([31, 33, 41, 43, 44, 45, 46, 47]);

/** Tipos que modifican otro comprobante y exigen <InformacionReferencia>. */
export const TIPOS_CON_REFERENCIA = new Set([33, 34]);

export interface OpcionesXml {
  /** Vencimiento de la secuencia eNCF autorizada (se imprime como DD-MM-YYYY). */
  fechaVencimientoSecuencia?: Date | string;
}

@Injectable()
export class EcfXmlService {
  /**
   * Genera el XML del comprobante (sin firma) conforme al XSD correspondiente.
   *
   * @param ecf       Entidad ECF con sus líneas cargadas (ecf.lineas debe estar populated)
   * @param secuencia Número de secuencia para el eNCF (13 chars: E + tipo(2) + seq(10)).
   *                  Solo se usa como fallback si el ECF aún no tiene `encf` asignado;
   *                  si `ecf.encf` existe, SIEMPRE se reutiliza ese valor.
   */
  generateXml(ecf: Ecf, secuencia = 1, opciones: OpcionesXml = {}): string {
    const tipoNumerico = TIPO_ECF_MAP[ecf.tipoEcf];
    if (!tipoNumerico) {
      throw new Error(`Tipo ECF no soportado: "${ecf.tipoEcf}". Valores válidos: ${Object.keys(TIPO_ECF_MAP).join(', ')}`);
    }

    const eNCF = ecf.encf ?? this.buildENCF(tipoNumerico, secuencia);
    const now = new Date();
    const fechaEmision = this.toFecha(ecf.fechaEmision ?? now);
    const fechaHoraFirma = this.toDateTimeLocal(now);

    // TypeORM devuelve columnas NUMERIC como strings — convertir explícitamente.
    const total = Number(ecf.montoTotal);
    const itbis = Number(ecf.montoITBIS);
    const propina = Number(ecf.montoPropinaLegal);
    const totalesIdDoc = this.totalesPorTasa(ecf.lineas ?? []);

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ECF>',
      '  <Encabezado>',
      '    <Version>1.0</Version>',
      '    <IdDoc>',
      `      <TipoeCF>${tipoNumerico}</TipoeCF>`,
      `      <eNCF>${eNCF}</eNCF>`,
      // Nota de crédito: 0 si se emite dentro de los 30 días del comprobante que modifica, 1 si pasó más tiempo.
      ...(tipoNumerico === 34 ? [`      <IndicadorNotaCredito>${this.indicadorNotaCredito(ecf)}</IndicadorNotaCredito>`] : []),
      ...(TIPOS_CON_VENCIMIENTO_SECUENCIA.has(tipoNumerico)
        ? [`      <FechaVencimientoSecuencia>${this.fechaVencimiento(opciones, tipoNumerico)}</FechaVencimientoSecuencia>`]
        : []),
      `      <TipoIngresos>${this.esc(ecf.tipoIngresos)}</TipoIngresos>`,
      `      <TipoPago>${ecf.tipoPago}</TipoPago>`,
      ...(ecf.fechaLimitePago ? [`      <FechaLimitePago>${this.fechaColumna(ecf.fechaLimitePago)}</FechaLimitePago>`] : []),
      ...(ecf.terminoPago ? [`      <TerminoPago>${this.esc(ecf.terminoPago)}</TerminoPago>`] : []),
      '    </IdDoc>',
      '    <Emisor>',
      `      <RNCEmisor>${this.esc(ecf.rncEmisor)}</RNCEmisor>`,
      `      <RazonSocialEmisor>${this.esc(ecf.nombreEmisor)}</RazonSocialEmisor>`,
      // DireccionEmisor es requerida en el XSD (minOccurs=1)
      `      <DireccionEmisor>${this.esc(ecf.direccionEmisor || 'Sin Dirección Registrada')}</DireccionEmisor>`,
      `      <FechaEmision>${fechaEmision}</FechaEmision>`,
      '    </Emisor>',
      '    <Comprador>',
      // RNCComprador es minOccurs="0" en el XSD SOLO para e-CF_32 (venta a
      // consumidor final sin RNC/Cédula) — se omite el tag por completo si
      // no hay valor. Para los demás tipos, XsdValidatorService.validateEcf
      // ya exige que venga presente antes de llegar aquí.
      ...(ecf.rncComprador ? [`      <RNCComprador>${this.esc(ecf.rncComprador)}</RNCComprador>`] : []),
      ...(ecf.idExtranjeroComprador ? [`      <IdentificadorExtranjero>${this.esc(ecf.idExtranjeroComprador)}</IdentificadorExtranjero>`] : []),
      `      <RazonSocialComprador>${this.esc(ecf.nombreComprador)}</RazonSocialComprador>`,
      ...(ecf.correoComprador ? [`      <CorreoComprador>${this.esc(ecf.correoComprador)}</CorreoComprador>`] : []),
      ...(ecf.direccionComprador ? [`      <DireccionComprador>${this.esc(ecf.direccionComprador)}</DireccionComprador>`] : []),
      ...(ecf.municipioComprador ? [`      <MunicipioComprador>${this.esc(ecf.municipioComprador)}</MunicipioComprador>`] : []),
      ...(ecf.provinciaComprador ? [`      <ProvinciaComprador>${this.esc(ecf.provinciaComprador)}</ProvinciaComprador>`] : []),
      ...(ecf.telefonoComprador ? [`      <TelefonoAdicional>${this.esc(ecf.telefonoComprador)}</TelefonoAdicional>`] : []),
      ...(ecf.comentarioComprador ? [`      <InformacionAdicionalComprador>${this.esc(ecf.comentarioComprador)}</InformacionAdicionalComprador>`] : []),
      '    </Comprador>',
      '    <Totales>',
    ];

    // Totales desglosados por tasa según las líneas: una factura puede mezclar líneas
    // gravadas (18 %, 16 %), a tasa 0 y exentas. Orden exigido por el XSD de la DGII dentro
    // de <Totales>: MontoGravadoTotal, MontoGravadoI1..I3, MontoExento, ITBIS1..3 (tasas),
    // TotalITBIS y TotalITBIS1..3.
    const t = totalesIdDoc;
    if (t.hayLineas) {
      if (t.lineas[1] + t.lineas[2] + t.lineas[3] > 0) {
        lines.push(`      <MontoGravadoTotal>${this.r2(t.gravadoTotal)}</MontoGravadoTotal>`);
      }
      if (t.lineas[1] > 0) lines.push(`      <MontoGravadoI1>${this.r2(t.gravado[1])}</MontoGravadoI1>`);
      if (t.lineas[2] > 0) lines.push(`      <MontoGravadoI2>${this.r2(t.gravado[2])}</MontoGravadoI2>`);
      if (t.lineas[3] > 0) lines.push(`      <MontoGravadoI3>${this.r2(t.gravado[3])}</MontoGravadoI3>`);
      if (t.exento > 0) lines.push(`      <MontoExento>${this.r2(t.exento)}</MontoExento>`);
      if (t.lineas[1] > 0) lines.push('      <ITBIS1>18</ITBIS1>');
      if (t.lineas[2] > 0) lines.push('      <ITBIS2>16</ITBIS2>');
      if (t.lineas[3] > 0) lines.push('      <ITBIS3>0</ITBIS3>');
      if (t.lineas[1] + t.lineas[2] + t.lineas[3] > 0) {
        lines.push(`      <TotalITBIS>${this.r2(t.itbis[1] + t.itbis[2] + t.itbis[3])}</TotalITBIS>`);
        if (t.lineas[1] > 0) lines.push(`      <TotalITBIS1>${this.r2(t.itbis[1])}</TotalITBIS1>`);
        if (t.lineas[2] > 0) lines.push(`      <TotalITBIS2>${this.r2(t.itbis[2])}</TotalITBIS2>`);
        if (t.lineas[3] > 0) lines.push(`      <TotalITBIS3>${this.r2(t.itbis[3])}</TotalITBIS3>`);
      }
    } else if (itbis > 0) {
      // Sin líneas (no debería pasar): se conserva el cálculo antiguo, todo a tasa 1.
      lines.push(`      <MontoGravadoI1>${this.r2(total - itbis - propina)}</MontoGravadoI1>`);
      lines.push('      <ITBIS1>18</ITBIS1>');
      lines.push(`      <TotalITBIS>${this.r2(itbis)}</TotalITBIS>`);
      lines.push(`      <TotalITBIS1>${this.r2(itbis)}</TotalITBIS1>`);
    } else {
      lines.push(`      <MontoExento>${this.r2(total - propina)}</MontoExento>`);
    }

    if (ecf.aplicaPropinaLegal && propina > 0) {
      // Propina Legal: impuesto adicional código 001, tasa fija 10% (ad valorem)
      lines.push('      <ImpuestosAdicionales>');
      lines.push('        <ImpuestoAdicional>');
      lines.push('          <TipoImpuesto>001</TipoImpuesto>');
      lines.push('          <TasaImpuestoAdicional>10</TasaImpuestoAdicional>');
      lines.push(`          <MontoImpuestoSelectivoConsumoAdvalorem>${this.r2(propina)}</MontoImpuestoSelectivoConsumoAdvalorem>`);
      lines.push('        </ImpuestoAdicional>');
      lines.push('      </ImpuestosAdicionales>');
    }

    lines.push(`      <MontoTotal>${this.r2(total)}</MontoTotal>`);

    const itbisRetenido = Number(ecf.montoItbisRetenido);
    const rentaRetenido = Number(ecf.montoRentaRetenido);
    if (itbisRetenido > 0) {
      lines.push(`      <TotalITBISRetenido>${this.r2(itbisRetenido)}</TotalITBISRetenido>`);
    }
    if (rentaRetenido > 0) {
      lines.push(`      <TotalISRRetencion>${this.r2(rentaRetenido)}</TotalISRRetencion>`);
    }

    lines.push('    </Totales>');
    lines.push('  </Encabezado>');
    lines.push('  <DetallesItems>');

    const lineas = ecf.lineas ?? [];
    lineas.forEach((linea, i) => {
      const descuento = Number(linea.descuentoLinea);
      lines.push('    <Item>');
      lines.push(`      <NumeroLinea>${i + 1}</NumeroLinea>`);
      // IndicadorFacturacion: 1=ITBIS 18%, 2=ITBIS 16%, 3=ITBIS 0%, 4=Exento
      lines.push(`      <IndicadorFacturacion>${linea.indicadorFacturacion ?? 1}</IndicadorFacturacion>`);
      if (linea.indicadorAgenteRetencionoPercepcion) {
        lines.push('      <Retencion>');
        lines.push(`        <IndicadorAgenteRetencionoPercepcion>${linea.indicadorAgenteRetencionoPercepcion}</IndicadorAgenteRetencionoPercepcion>`);
        if (linea.montoItbisRetenido) {
          lines.push(`        <MontoITBISRetenido>${this.r2(Number(linea.montoItbisRetenido))}</MontoITBISRetenido>`);
        }
        if (linea.montoIsrRetenido) {
          lines.push(`        <MontoISRRetenido>${this.r2(Number(linea.montoIsrRetenido))}</MontoISRRetenido>`);
        }
        lines.push('      </Retencion>');
      }
      lines.push(`      <NombreItem>${this.esc(linea.descripcion)}</NombreItem>`);
      // IndicadorBienoServicio: 1 = Bien, 2 = Servicio
      lines.push(`      <IndicadorBienoServicio>${linea.indicadorBienoServicio ?? 1}</IndicadorBienoServicio>`);
      lines.push(`      <CantidadItem>${Number(linea.cantidad).toFixed(2)}</CantidadItem>`);
      if (linea.unidadMedida) {
        lines.push(`      <UnidadMedida>${linea.unidadMedida}</UnidadMedida>`);
      }
      lines.push(`      <PrecioUnitarioItem>${Number(linea.precioUnitario).toFixed(4)}</PrecioUnitarioItem>`);
      if (descuento > 0) {
        lines.push(`      <DescuentoMonto>${this.r2(descuento)}</DescuentoMonto>`);
      }
      // MontoItem = subtotal de la línea (sin ITBIS) — requerido por XSD
      lines.push(`      <MontoItem>${this.r2(Number(linea.subtotal))}</MontoItem>`);
      lines.push('    </Item>');
    });

    lines.push('  </DetallesItems>');
    if (TIPOS_CON_REFERENCIA.has(tipoNumerico)) {
      // Nota de crédito/débito: identifica el comprobante que modifica.
      lines.push('  <InformacionReferencia>');
      lines.push(`    <NCFModificado>${this.esc(ecf.ncfModificado ?? '')}</NCFModificado>`);
      lines.push(`    <FechaNCFModificado>${this.fechaColumna(ecf.fechaNcfModificado as Date | string)}</FechaNCFModificado>`);
      lines.push(`    <CodigoModificacion>${ecf.codigoModificacion}</CodigoModificacion>`);
      if (ecf.razonModificacion) {
        lines.push(`    <RazonModificacion>${this.esc(ecf.razonModificacion)}</RazonModificacion>`);
      }
      lines.push('  </InformacionReferencia>');
    }
    // FechaHoraFirma es requerida (minOccurs=1) y va antes del elemento xs:any (Signature)
    lines.push(`  <FechaHoraFirma>${fechaHoraFirma}</FechaHoraFirma>`);
    lines.push('</ECF>');

    return lines.join('\n');
  }

  /** Ruta al XSD correspondiente al tipo de ECF. */
  getSchemaPath(tipoEcf: string): string {
    return `${SCHEMA_BASEPATH}/${tipoEcf}.xsd`;
  }

  /**
   * Construye el eNCF a partir del código interno de tipo (e-CF_31_v_1_0 → E31…)
   * y una secuencia. Usado por EcfService al asignar la secuencia persistida.
   */
  buildEncf(tipoEcf: string, secuencia: number): string {
    const tipoNumerico = TIPO_ECF_MAP[tipoEcf];
    if (!tipoNumerico) {
      throw new Error(`Tipo ECF no soportado: "${tipoEcf}". Valores válidos: ${Object.keys(TIPO_ECF_MAP).join(', ')}`);
    }
    return this.buildENCF(tipoNumerico, secuencia);
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Construye el eNCF de 13 caracteres:  E + tipo(2 dígitos) + secuencia(10 dígitos)
   * Ejemplo: E310000000001
   */
  private buildENCF(tipo: number, seq: number): string {
    if (!Number.isInteger(seq) || seq < 1 || seq > 9_999_999_999) {
      throw new Error(`Secuencia eNCF inválida: ${seq} (debe ser un entero entre 1 y 9999999999)`);
    }
    return `E${tipo}${String(seq).padStart(10, '0')}`;
  }

  /** Formato de fecha DGII: DD-MM-YYYY */
  private toFecha(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /**
   * Formato de fecha-hora exigido por el XSD de la DGII para FechaHoraFirma:
   * DD-MM-YYYY HH:MM:SS (DateTimeValidationType), no ISO 8601.
   */
  private toDateTimeLocal(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${this.toFecha(date)} ${hh}:${mi}:${ss}`;
  }

  /**
   * Suma las líneas por tasa de ITBIS (indicador 1 = 18 %, 2 = 16 %, 3 = 0 %, 4 = exento)
   * con los importes ya calculados al crear el comprobante (subtotal e ITBIS por línea).
   */
  private totalesPorTasa(lineas: Ecf['lineas']) {
    const gravado: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const itbis: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const nLineas: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    let exento = 0;
    for (const l of lineas ?? []) {
      const ind = l.indicadorFacturacion ?? 1;
      const sub = Number(l.subtotal);
      if (ind >= 1 && ind <= 3) {
        gravado[ind] += sub;
        itbis[ind] += Number(l.itbis);
        nLineas[ind] += 1;
      } else {
        exento += sub;
      }
    }
    const redondear = (n: number) => Math.round(n * 100) / 100;
    return {
      hayLineas: (lineas ?? []).length > 0,
      gravado: { 1: redondear(gravado[1]), 2: redondear(gravado[2]), 3: redondear(gravado[3]) } as Record<number, number>,
      itbis: { 1: redondear(itbis[1]), 2: redondear(itbis[2]), 3: redondear(itbis[3]) } as Record<number, number>,
      lineas: nLineas,
      exento: redondear(exento),
      gravadoTotal: redondear(gravado[1] + gravado[2] + gravado[3]),
    };
  }

  private fechaVencimiento(opciones: OpcionesXml, tipo: number): string {
    if (!opciones.fechaVencimientoSecuencia) {
      throw new Error(
        `Falta la fecha de vencimiento de la secuencia eNCF del tipo ${tipo} (se configura en Secuencias)`,
      );
    }
    return this.fechaColumna(opciones.fechaVencimientoSecuencia);
  }

  /** 0 si la nota de crédito se emite dentro de los 30 días del comprobante que modifica; 1 si no. */
  private indicadorNotaCredito(ecf: Ecf): number {
    if (!ecf.fechaNcfModificado) return 0;
    const dias = (new Date(ecf.fechaEmision ?? new Date()).getTime() - new Date(ecf.fechaNcfModificado).getTime()) / 86_400_000;
    return dias > 30 ? 1 : 0;
  }

  /**
   * Columna `date` (llega como 'YYYY-MM-DD' o como Date) → DD-MM-YYYY. Un texto
   * 'YYYY-MM-DD' no pasa por Date para que la zona horaria del servidor no lo corra un día.
   */
  private fechaColumna(v: Date | string): string {
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
    return this.toFecha(new Date(v));
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
