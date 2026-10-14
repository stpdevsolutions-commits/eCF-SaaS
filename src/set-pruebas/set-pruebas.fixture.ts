import * as ExcelJS from 'exceljs';

/** Hoja sintética: encabezados (etiquetas XML) + filas de valores. */
export interface HojaFixture {
  nombre: string;
  encabezados: string[];
  filas: unknown[][];
}

/** Construye un .xlsx en memoria con las hojas indicadas (solo para pruebas). */
export async function crearExcelPrueba(hojas: HojaFixture[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre);
    ws.addRow(h.encabezados);
    h.filas.forEach((f) => ws.addRow(f));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type FilaDict = Record<string, unknown>;

/**
 * Caso de prueba sintético VÁLIDO para el tipo dado (datos inventados):
 *  - 31/32/33/34/41/45: 2 x 100 gravado al 18 % → 200 + ITBIS 36 = 236.
 *  - 44/47/43: ítem exento (200).
 *  - 46: ítem a tasa 0 % (exportación, 200).
 */
export function casoValido(tipo: number, secuencia = 1, extra: FilaDict = {}): FilaDict {
  const exento = [43, 44, 47].includes(tipo);
  const exportacion = tipo === 46;
  const gravado18 = !exento && !exportacion;
  const dict: FilaDict = {
    CasoPrueba: `CASO-${tipo}-${secuencia}`,
    TipoeCF: tipo,
    eNCF: `E${tipo}${String(secuencia).padStart(10, '0')}`,
    FechaVencimientoSecuencia: '31-12-2027',
    TipoIngresos: 1,
    TipoPago: 1,
    RNCEmisor: '130000001',
    RazonSocialEmisor: 'EMPRESA DE PRUEBA SRL',
    DireccionEmisor: 'Calle Falsa 123, Santo Domingo',
    FechaEmision: '14-10-2026',
    RNCComprador: tipo === 47 ? undefined : '131000002',
    RazonSocialComprador: 'CLIENTE DE PRUEBA SA',
    ...(gravado18 ? { MontoGravadoTotal: 200, MontoGravadoI1: 200, TotalITBIS: 36, TotalITBIS1: 36 } : {}),
    ...(exportacion ? { MontoGravadoTotal: 200, MontoGravadoI3: 200, TotalITBIS: 0, TotalITBIS3: 0 } : {}),
    ...(exento ? { MontoExento: 200 } : {}),
    MontoTotal: gravado18 ? 236 : 200,
    ...(tipo === 33 || tipo === 34
      ? { NCFModificado: 'E310000000099', FechaNCFModificado: '01-10-2026', CodigoModificacion: 3, RazonModificacion: 'Ajuste de monto' }
      : {}),
    'NumeroLinea[1]': 1,
    'IndicadorFacturacion[1]': gravado18 ? 1 : exportacion ? 3 : 4,
    ...(tipo === 41 ? { 'IndicadorAgenteRetencionoPercepcion[1]': 1, 'MontoITBISRetenido[1]': 27, TotalITBISRetenido: 27 } : {}),
    ...(tipo === 47 ? { 'IndicadorAgenteRetencionoPercepcion[1]': 1, 'MontoISRRetenido[1]': 20, TotalISRRetencion: 20 } : {}),
    'NombreItem[1]': 'Servicio de prueba',
    'IndicadorBienoServicio[1]': 2,
    'CantidadItem[1]': 2,
    'UnidadMedida[1]': 43,
    'PrecioUnitarioItem[1]': 100,
    'MontoItem[1]': 200,
    ...extra,
  };
  return dict;
}

/** Arma una hoja con el nombre dado a partir de casos (los encabezados son la unión de claves, en orden). */
export function hojaDesdeCasos(nombre: string, casos: FilaDict[]): HojaFixture {
  const encabezados: string[] = [];
  for (const c of casos) for (const k of Object.keys(c)) if (!encabezados.includes(k)) encabezados.push(k);
  return { nombre, encabezados, filas: casos.map((c) => encabezados.map((h) => c[h])) };
}
