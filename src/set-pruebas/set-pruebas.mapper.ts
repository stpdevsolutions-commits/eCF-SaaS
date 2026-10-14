import { Ecf } from '../ecf/entities/ecf.entity';
import { OpcionesXml, TIPOS_CON_VENCIMIENTO_SECUENCIA } from '../ecf/services/ecf-xml.service';
import { XsdValidatorService } from '../validation/xsd-validator.service';
import { FilaCruda, TipoSet } from './set-pruebas.types';

/** IndicadorFacturacion (XSD) → tasa de ITBIS; mismo criterio que EcfService.calcularLineasYTotales. */
const TASA_POR_INDICADOR: Record<number, number> = { 1: 0.18, 2: 0.16, 3: 0, 4: 0 };

const TOLERANCIA = 0.011;

export interface FilaMapeada {
  /** Modelo del e-CF listo para EcfXmlService.generateXml (NO se persiste). */
  ecf: Ecf;
  opcionesXml: OpcionesXml;
  caso?: string;
  encf?: string;
  errores: string[];
  advertencias: string[];
}

// ── Conversores tolerantes ────────────────────────────────────────────────────

function texto(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Date) return undefined;
  const t = String(v).trim();
  return t === '' ? undefined : t;
}

/** Número con punto decimal (se tolera coma de miles). NaN si no es numérico. */
function numero(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const t = String(v).trim().replace(/,/g, '');
  if (t === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Fecha de Excel o texto DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD → {y,m,d}; null si no es válida. */
function fechaPartes(v: unknown): { y: number; m: number; d: number } | null | undefined {
  if (v === undefined || v === null) return undefined;
  let y: number, m: number, d: number;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // exceljs entrega las fechas como UTC medianoche
    y = v.getUTCFullYear();
    m = v.getUTCMonth() + 1;
    d = v.getUTCDate();
  } else {
    const t = String(v).trim();
    let mt = t.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (mt) {
      d = Number(mt[1]); m = Number(mt[2]); y = Number(mt[3]);
    } else if ((mt = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      y = Number(mt[1]); m = Number(mt[2]); d = Number(mt[3]);
    } else {
      return null;
    }
  }
  const prueba = new Date(Date.UTC(y, m - 1, d));
  if (prueba.getUTCFullYear() !== y || prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) return null;
  return { y, m, d };
}

const iso = (p: { y: number; m: number; d: number }) =>
  `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** RNCComprador y RazonSocialComprador obligatorios por tipo, según los XSD oficiales de la DGII. */
export const TIPOS_RNC_COMPRADOR_OBLIGATORIO = new Set([31, 41, 45]);

/**
 * Convierte una fila cruda del Excel al modelo de e-CF del proyecto, validando
 * campo por campo y cotejando los totales declarados en el Excel contra los
 * calculados por el mismo motor que usa el flujo normal.
 */
export function mapearFila(
  fila: FilaCruda,
  tipo: TipoSet,
  validator: XsdValidatorService,
): FilaMapeada {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const c = fila.campos;
  const tipoEcf = `e-CF_${tipo}_v_1_0`;

  if (fila.columnasSinMapear.length > 0) {
    advertencias.push(`Columnas con datos que no se mapean al XML: ${fila.columnasSinMapear.join(', ')}`);
  }

  // ── Identificación ──────────────────────────────────────────────────────────
  const caso = texto(c['CasoPrueba']);
  const encf = texto(c['eNCF']);
  const tipoDeclarado = numero(c['TipoeCF']);
  if (tipoDeclarado !== undefined && tipoDeclarado !== tipo) {
    errores.push(`TipoeCF=${c['TipoeCF']} no coincide con el tipo de la hoja (${tipo})`);
  }
  if (!encf) {
    errores.push('Falta eNCF');
  } else if (!/^E\d{12}$/.test(encf)) {
    errores.push(`eNCF inválido "${encf}" (se espera E + tipo de 2 dígitos + secuencia de 10 dígitos)`);
  } else if (Number(encf.substring(1, 3)) !== tipo) {
    errores.push(`eNCF "${encf}" no corresponde al tipo ${tipo}`);
  }

  // ── Fechas ──────────────────────────────────────────────────────────────────
  const fEmision = fechaPartes(c['FechaEmision']);
  if (fEmision === undefined) errores.push('Falta FechaEmision');
  else if (fEmision === null) errores.push(`FechaEmision inválida "${String(c['FechaEmision'])}"`);

  const opcionesXml: OpcionesXml = {};
  const fVenc = fechaPartes(c['FechaVencimientoSecuencia']);
  if (fVenc === null) errores.push(`FechaVencimientoSecuencia inválida "${String(c['FechaVencimientoSecuencia'])}"`);
  else if (fVenc) opcionesXml.fechaVencimientoSecuencia = iso(fVenc);
  else if (TIPOS_CON_VENCIMIENTO_SECUENCIA.has(tipo)) errores.push('Falta FechaVencimientoSecuencia (obligatoria para este tipo)');

  const fLimite = fechaPartes(c['FechaLimitePago']);
  if (fLimite === null) errores.push(`FechaLimitePago inválida "${String(c['FechaLimitePago'])}"`);

  // ── Pago / ingresos ─────────────────────────────────────────────────────────
  const tipoPago = numero(c['TipoPago']) ?? 1;
  if (![1, 2, 3].includes(tipoPago)) errores.push(`TipoPago inválido "${String(c['TipoPago'])}" (1, 2 o 3)`);
  const tipoIngresosCrudo = numero(c['TipoIngresos']);
  const tipoIngresos = tipoIngresosCrudo === undefined ? '01' : String(tipoIngresosCrudo).padStart(2, '0');
  if (!/^0[1-6]$/.test(tipoIngresos)) errores.push(`TipoIngresos inválido "${String(c['TipoIngresos'])}" (01 a 06)`);
  const terminoPago = texto(c['TerminoPago']);
  if (terminoPago && !/^[\s\d\w]{1,15}$/.test(terminoPago)) errores.push(`TerminoPago inválido "${terminoPago}" (máx. 15 caracteres alfanuméricos)`);

  // ── Referencia (notas de crédito/débito) ────────────────────────────────────
  const fNcfMod = fechaPartes(c['FechaNCFModificado']);
  if (fNcfMod === null) errores.push(`FechaNCFModificado inválida "${String(c['FechaNCFModificado'])}"`);
  const codigoMod = numero(c['CodigoModificacion']);
  if (codigoMod !== undefined && ![1, 2, 3, 4, 5].includes(codigoMod)) {
    errores.push(`CodigoModificacion inválido "${String(c['CodigoModificacion'])}" (1 a 5)`);
  }
  const ncfMod = texto(c['NCFModificado']);
  if (ncfMod && !/^[A-Za-z0-9]{11,19}$/.test(ncfMod)) errores.push(`NCFModificado inválido "${ncfMod}" (11 a 19 caracteres alfanuméricos)`);

  // ── Ítems ───────────────────────────────────────────────────────────────────
  const indices = [...fila.items.keys()].sort((a, b) => a - b);
  if (indices.length === 0) errores.push('El caso no tiene ítems (columnas NombreItem[n], CantidadItem[n], ...)');

  let montoTotal = 0;
  let montoITBIS = 0;
  let montoItbisRetenido = 0;
  let montoRentaRetenido = 0;
  const gravado: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const itbisPorTasa: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let exento = 0;

  const lineas = indices.map((idx, pos) => {
    const it = fila.items.get(idx) as Record<string, unknown>;
    const pref = `Ítem ${idx}:`;
    const num = (k: string, obligatorio: boolean, defecto?: number): number => {
      const n = numero(it[k]);
      if (n === undefined) {
        if (obligatorio) errores.push(`${pref} falta ${k}`);
        return defecto ?? 0;
      }
      if (Number.isNaN(n)) {
        errores.push(`${pref} ${k} no es numérico ("${String(it[k])}")`);
        return defecto ?? 0;
      }
      return n;
    };

    const descripcion = texto(it['NombreItem']) ?? '';
    if (!descripcion) errores.push(`${pref} falta NombreItem`);
    const cantidad = num('CantidadItem', true);
    if (cantidad <= 0) errores.push(`${pref} CantidadItem debe ser mayor a 0`);
    const precioUnitario = num('PrecioUnitarioItem', true);
    if (precioUnitario < 0) errores.push(`${pref} PrecioUnitarioItem no puede ser negativo`);
    const descuentoLinea = num('DescuentoMonto', false, 0);
    const indicadorFacturacion = num('IndicadorFacturacion', false, 1);
    if (![1, 2, 3, 4].includes(indicadorFacturacion)) errores.push(`${pref} IndicadorFacturacion inválido (1 a 4)`);
    const indicadorBienoServicio = num('IndicadorBienoServicio', false, 1);
    if (![1, 2].includes(indicadorBienoServicio)) errores.push(`${pref} IndicadorBienoServicio inválido (1 o 2)`);
    const unidadMedida = numero(it['UnidadMedida']);
    if (unidadMedida !== undefined && (Number.isNaN(unidadMedida) || unidadMedida < 1 || unidadMedida > 54)) {
      errores.push(`${pref} UnidadMedida inválida (código 1 a 54)`);
    }
    const agente = numero(it['IndicadorAgenteRetencionoPercepcion']);
    if (agente !== undefined && ![1, 2].includes(agente)) errores.push(`${pref} IndicadorAgenteRetencionoPercepcion inválido (1 o 2)`);
    if (tipo === 41 && agente === undefined) errores.push(`${pref} el e-CF 41 exige IndicadorAgenteRetencionoPercepcion (1=Retención, 2=Percepción)`);
    const retItbis = numero(it['MontoITBISRetenido']);
    const retIsr = numero(it['MontoISRRetenido']);
    if ((retItbis !== undefined && Number.isNaN(retItbis)) || (retIsr !== undefined && Number.isNaN(retIsr))) {
      errores.push(`${pref} monto de retención no numérico`);
    }

    const numLinea = numero(it['NumeroLinea']);
    if (numLinea !== undefined && numLinea !== pos + 1) {
      advertencias.push(`${pref} NumeroLinea=${numLinea} se renumera como ${pos + 1} (el XML numera en orden)`);
    }

    const tasa = TASA_POR_INDICADOR[indicadorFacturacion] ?? 0.18;
    const { subtotal, itbis, total } = validator.calculateLineTotal(cantidad, precioUnitario, descuentoLinea, tasa);
    const montoItemDeclarado = numero(it['MontoItem']);
    if (montoItemDeclarado !== undefined && !Number.isNaN(montoItemDeclarado) && Math.abs(montoItemDeclarado - subtotal) > TOLERANCIA) {
      errores.push(`${pref} MontoItem del Excel (${montoItemDeclarado}) no coincide con cantidad×precio−descuento (${r2(subtotal)})`);
    }

    montoTotal += total;
    montoITBIS += itbis;
    if (indicadorFacturacion >= 1 && indicadorFacturacion <= 3) {
      gravado[indicadorFacturacion] += subtotal;
      itbisPorTasa[indicadorFacturacion] += itbis;
    } else {
      exento += subtotal;
    }
    montoItbisRetenido += retItbis && !Number.isNaN(retItbis) ? retItbis : 0;
    montoRentaRetenido += retIsr && !Number.isNaN(retIsr) ? retIsr : 0;

    return {
      numero: pos + 1,
      descripcion,
      indicadorBienoServicio,
      unidadMedida: unidadMedida !== undefined && !Number.isNaN(unidadMedida) ? unidadMedida : undefined,
      indicadorFacturacion,
      cantidad,
      precioUnitario,
      descuentoLinea,
      subtotal,
      itbis,
      indicadorAgenteRetencionoPercepcion: agente,
      montoItbisRetenido: retItbis && !Number.isNaN(retItbis) ? retItbis : undefined,
      montoIsrRetenido: retIsr && !Number.isNaN(retIsr) ? retIsr : undefined,
    };
  });

  // ── Cotejo de totales declarados vs. calculados ─────────────────────────────
  const cotejar = (campo: string, calculado: number) => {
    const declarado = numero(c[campo]);
    if (declarado === undefined) return;
    if (Number.isNaN(declarado)) {
      errores.push(`${campo} no es numérico ("${String(c[campo])}")`);
    } else if (Math.abs(declarado - calculado) > TOLERANCIA) {
      errores.push(`${campo} del Excel (${declarado}) no coincide con el calculado (${r2(calculado)})`);
    }
  };
  cotejar('MontoGravadoTotal', gravado[1] + gravado[2] + gravado[3]);
  cotejar('MontoGravadoI1', gravado[1]);
  cotejar('MontoGravadoI2', gravado[2]);
  cotejar('MontoGravadoI3', gravado[3]);
  cotejar('MontoExento', exento);
  cotejar('TotalITBIS', montoITBIS);
  cotejar('TotalITBIS1', itbisPorTasa[1]);
  cotejar('TotalITBIS2', itbisPorTasa[2]);
  cotejar('TotalITBIS3', itbisPorTasa[3]);
  cotejar('MontoTotal', montoTotal);
  cotejar('TotalITBISRetenido', montoItbisRetenido);
  cotejar('TotalISRRetencion', montoRentaRetenido);

  // ── Modelo ──────────────────────────────────────────────────────────────────
  const ecf = {
    tipoEcf,
    version: 'v1.0',
    encf,
    fechaEmision: fEmision ? new Date(fEmision.y, fEmision.m - 1, fEmision.d) : undefined,
    rncEmisor: texto(c['RNCEmisor']),
    nombreEmisor: texto(c['RazonSocialEmisor']),
    direccionEmisor: texto(c['DireccionEmisor']),
    tipoPago,
    tipoIngresos,
    terminoPago,
    fechaLimitePago: fLimite ? iso(fLimite) : undefined,
    ncfModificado: ncfMod,
    fechaNcfModificado: fNcfMod ? iso(fNcfMod) : undefined,
    codigoModificacion: codigoMod,
    razonModificacion: texto(c['RazonModificacion']),
    rncComprador: texto(c['RNCComprador']),
    idExtranjeroComprador: texto(c['IdentificadorExtranjero']),
    nombreComprador: texto(c['RazonSocialComprador']),
    telefonoComprador: texto(c['TelefonoAdicional']),
    correoComprador: texto(c['CorreoComprador']),
    direccionComprador: texto(c['DireccionComprador']),
    provinciaComprador: texto(c['ProvinciaComprador']),
    municipioComprador: texto(c['MunicipioComprador']),
    comentarioComprador: texto(c['InformacionAdicionalComprador']),
    aplicaPropinaLegal: false,
    montoPropinaLegal: 0,
    montoTotal: r2(montoTotal),
    montoDescuento: 0,
    montoITBIS: r2(montoITBIS),
    montoItbisRetenido: r2(montoItbisRetenido),
    montoRentaRetenido: r2(montoRentaRetenido),
    moneda: 'RD',
    estado: 'draft',
    lineas,
  } as unknown as Ecf;

  // ── Validación común del proyecto (la misma del flujo normal) ───────────────
  const generica = validator.validateEcf({
    ...ecf,
    referencia: ncfMod
      ? { ncfModificado: ncfMod, fechaNcfModificado: ecf.fechaNcfModificado, codigoModificacion: codigoMod }
      : undefined,
  } as unknown as Record<string, unknown>);
  for (const e of generica.errors) {
    // Los errores de línea y de "sin líneas" ya se reportaron arriba con más detalle.
    if (e.startsWith('Línea ') || e.startsWith('Debe haber al menos una línea')) continue;
    if (!errores.includes(e)) errores.push(e);
  }

  return { ecf, opcionesXml, caso, encf, errores, advertencias };
}
