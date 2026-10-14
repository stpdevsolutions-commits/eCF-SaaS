import * as ExcelJS from 'exceljs';
import { FilaCruda, HojaLeida, LecturaExcel, TIPOS_SET_PRUEBAS, TipoSet } from './set-pruebas.types';

/*
 * SUPUESTOS SOBRE EL FORMATO DEL EXCEL DEL SET DE PRUEBAS
 * -------------------------------------------------------
 * El Excel oficial solo se descarga del Portal de Certificación de la DGII
 * (no está en este repo), así que el formato se asume así — si el real
 * difiere, se ajusta aquí y en CAMPOS_ENCABEZADO / CAMPOS_ITEM:
 *
 *  1. Una hoja por tipo de e-CF. El tipo se deduce del NOMBRE de la hoja
 *     (primer 31/32/33/34/41/43/44/45/46/47 aislado: "31", "E31", "ECF 31",
 *     "e-CF 31 Credito Fiscal"...). Si el nombre no lo dice, se usa la
 *     columna TipoeCF de la primera fila de datos. Hojas sin tipo o sin
 *     encabezado reconocible se omiten y se reportan.
 *  2. Fila de encabezados = la primera (dentro de las 10 primeras filas) con
 *     al menos 3 columnas reconocidas, entre ellas eNCF. Los encabezados son
 *     nombres de etiqueta XML de la DGII (RNCEmisor, RazonSocialEmisor,
 *     FechaEmision, MontoTotal...), sin importar mayúsculas, acentos,
 *     espacios o guiones bajos.
 *  3. Cada fila siguiente con datos = un caso de prueba (un e-CF). Columna
 *     opcional CasoPrueba = identificador del caso.
 *  4. Los ítems van en columnas repetidas con sufijo de índice:
 *     NombreItem[1], CantidadItem[1], PrecioUnitarioItem[1], ... NombreItem[2]...
 *     (también se acepta "(1)" o "_1"). Sin sufijo = ítem 1.
 *  5. Fechas: celdas de fecha de Excel, o texto DD-MM-YYYY / DD/MM/YYYY /
 *     YYYY-MM-DD. Números: con punto decimal (se tolera coma de miles).
 */

/** Campos de encabezado/totales/referencia reconocidos (nombre canónico = etiqueta XML). */
export const CAMPOS_ENCABEZADO = [
  'CasoPrueba', 'TipoeCF', 'eNCF', 'FechaVencimientoSecuencia', 'IndicadorNotaCredito',
  'TipoIngresos', 'TipoPago', 'FechaLimitePago', 'TerminoPago',
  'RNCEmisor', 'RazonSocialEmisor', 'DireccionEmisor', 'FechaEmision',
  'RNCComprador', 'IdentificadorExtranjero', 'RazonSocialComprador', 'CorreoComprador',
  'DireccionComprador', 'MunicipioComprador', 'ProvinciaComprador', 'TelefonoAdicional',
  'InformacionAdicionalComprador',
  'MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3', 'MontoExento',
  'TotalITBIS', 'TotalITBIS1', 'TotalITBIS2', 'TotalITBIS3', 'MontoTotal',
  'TotalITBISRetenido', 'TotalISRRetencion',
  'NCFModificado', 'FechaNCFModificado', 'CodigoModificacion', 'RazonModificacion',
] as const;

export const CAMPOS_ITEM = [
  'NumeroLinea', 'IndicadorFacturacion', 'NombreItem', 'IndicadorBienoServicio',
  'CantidadItem', 'UnidadMedida', 'PrecioUnitarioItem', 'DescuentoMonto', 'MontoItem',
  'IndicadorAgenteRetencionoPercepcion', 'MontoITBISRetenido', 'MontoISRRetenido',
] as const;

/** Columnas conocidas del Set que se leen pero NO afectan al XML (informativas): no generan aviso. */
const CAMPOS_IGNORADOS = ['Version', 'TipoDeDocumento', 'Hoja', 'Notas', 'Observaciones', 'DescripcionItem'];

/** Normaliza un encabezado: sin acentos, minúsculas, solo alfanumérico. */
export function normalizarEncabezado(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const MAPA_ENCABEZADO = new Map<string, string>(CAMPOS_ENCABEZADO.map((c) => [normalizarEncabezado(c), c]));
MAPA_ENCABEZADO.set('caso', 'CasoPrueba');
MAPA_ENCABEZADO.set('casodeprueba', 'CasoPrueba');
const MAPA_ITEM = new Map<string, string>(CAMPOS_ITEM.map((c) => [normalizarEncabezado(c), c]));
const IGNORADOS = new Set(CAMPOS_IGNORADOS.map(normalizarEncabezado));

interface ColumnaMapeada {
  indice: number;
  encabezadoOriginal: string;
  campo?: string;
  item?: number;
  ignorada?: boolean;
}

/** Valor "plano" de una celda de exceljs (fórmulas, texto enriquecido, hipervínculos). */
export function valorCelda(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  const o = v as unknown as Record<string, unknown>;
  if ('result' in o) return valorCelda(o['result'] as ExcelJS.CellValue);
  if (Array.isArray(o['richText'])) {
    const t = (o['richText'] as { text: string }[]).map((r) => r.text).join('').trim();
    return t === '' ? undefined : t;
  }
  if (typeof o['text'] === 'string') return (o['text'] as string).trim() || undefined;
  return undefined;
}

function mapearColumna(indice: number, original: string): ColumnaMapeada {
  const base: ColumnaMapeada = { indice, encabezadoOriginal: original };
  const sufijo = original.match(/^(.+?)\s*[[(]\s*(\d+)\s*[\])]$/) ?? original.match(/^(.+?)_(\d+)$/);
  if (sufijo) {
    const campoItem = MAPA_ITEM.get(normalizarEncabezado(sufijo[1]));
    if (campoItem) return { ...base, campo: campoItem, item: Number(sufijo[2]) };
  }
  const norm = normalizarEncabezado(original);
  const enc = MAPA_ENCABEZADO.get(norm);
  if (enc) return { ...base, campo: enc };
  const it = MAPA_ITEM.get(norm);
  if (it) return { ...base, campo: it, item: 1 };
  if (IGNORADOS.has(norm)) return { ...base, ignorada: true };
  return base;
}

export function tipoDesdeNombreHoja(nombre: string): TipoSet | undefined {
  const m = nombre.match(/(?<!\d)(31|32|33|34|41|43|44|45|46|47)(?!\d)/);
  return m ? (Number(m[1]) as TipoSet) : undefined;
}

/** Lee el Excel del Set de Pruebas (Buffer o ruta) y lo separa en hojas/filas crudas. */
export async function leerExcelSetPruebas(origen: Buffer | string): Promise<LecturaExcel> {
  const wb = new ExcelJS.Workbook();
  if (typeof origen === 'string') {
    await wb.xlsx.readFile(origen);
  } else {
    // exceljs tipa su propio `Buffer`; el Buffer de Node es compatible en runtime.
    await wb.xlsx.load(origen as unknown as ExcelJS.Buffer);
  }

  const hojas: HojaLeida[] = [];
  const hojasOmitidas: { nombre: string; motivo: string }[] = [];

  for (const ws of wb.worksheets) {
    // 1) fila de encabezados
    let filaEnc = 0;
    let columnas: ColumnaMapeada[] = [];
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cols: ColumnaMapeada[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const v = valorCelda(cell.value);
        if (typeof v === 'string') cols.push(mapearColumna(c, v));
      });
      const reconocidas = cols.filter((c) => c.campo).length;
      if (reconocidas >= 3 && cols.some((c) => c.campo === 'eNCF')) {
        filaEnc = r;
        columnas = cols;
        break;
      }
    }
    if (!filaEnc) {
      hojasOmitidas.push({
        nombre: ws.name,
        motivo: 'No se encontró una fila de encabezados reconocible (se espera eNCF y etiquetas XML de la DGII)',
      });
      continue;
    }

    // 2) filas de datos
    const filas: FilaCruda[] = [];
    for (let r = filaEnc + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const fila: FilaCruda = { numeroFila: r, campos: {}, items: new Map(), columnasSinMapear: [] };
      let hayDatos = false;
      for (const col of columnas) {
        const v = valorCelda(row.getCell(col.indice).value);
        if (v === undefined) continue;
        hayDatos = true;
        if (col.item !== undefined && col.campo) {
          const item = fila.items.get(col.item) ?? {};
          item[col.campo] = v;
          fila.items.set(col.item, item);
        } else if (col.campo) {
          fila.campos[col.campo] = v;
        } else if (!col.ignorada) {
          fila.columnasSinMapear.push(col.encabezadoOriginal);
        }
      }
      if (hayDatos) filas.push(fila);
    }

    // 3) tipo de la hoja
    let tipo = tipoDesdeNombreHoja(ws.name);
    if (!tipo && filas.length > 0) {
      const t = Number(filas[0].campos['TipoeCF']);
      if ((TIPOS_SET_PRUEBAS as readonly number[]).includes(t)) tipo = t as TipoSet;
    }
    if (!tipo) {
      hojasOmitidas.push({
        nombre: ws.name,
        motivo: 'No se pudo determinar el tipo de e-CF (ni por el nombre de la hoja ni por la columna TipoeCF)',
      });
      continue;
    }
    hojas.push({ nombre: ws.name, tipo, filas });
  }

  return { hojas, hojasOmitidas };
}
