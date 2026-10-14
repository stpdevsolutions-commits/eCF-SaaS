/** Tipos de e-CF que cubre el Set de Pruebas (una hoja del Excel por tipo). */
export const TIPOS_SET_PRUEBAS = [31, 32, 33, 34, 41, 43, 44, 45, 46, 47] as const;
export type TipoSet = (typeof TIPOS_SET_PRUEBAS)[number];

/** Una fila (caso de prueba) del Excel, ya separada en campos del encabezado e ítems. */
export interface FilaCruda {
  /** Número de fila en la hoja de Excel (1-based). */
  numeroFila: number;
  /** Campos del encabezado/totales/referencia, por nombre canónico de etiqueta XML. */
  campos: Record<string, unknown>;
  /** Campos por ítem: índice (1..n) → nombre canónico → valor. */
  items: Map<number, Record<string, unknown>>;
  /** Columnas con valor que el importador no sabe mapear (se avisa, no se ignora en silencio). */
  columnasSinMapear: string[];
}

export interface HojaLeida {
  nombre: string;
  tipo?: TipoSet;
  filas: FilaCruda[];
}

export interface LecturaExcel {
  hojas: HojaLeida[];
  /** Hojas que no se pudieron asociar a un tipo de e-CF (o sin encabezado reconocible), con el motivo. */
  hojasOmitidas: { nombre: string; motivo: string }[];
}

export type EstadoFila = 'OK' | 'ERROR';

export interface ResultadoFila {
  hoja: string;
  fila: number;
  caso?: string;
  tipo?: number;
  encf?: string;
  estado: EstadoFila;
  errores: string[];
  advertencias: string[];
  /** Archivo escrito (solo si hay directorio de salida). */
  archivo?: string;
}

export interface OpcionesImportacion {
  /**
   * Por defecto TRUE: genera y valida los XML pero no firma ni escribe nada
   * (salvo `directorioSalida`, donde deja los XML SIN firmar). Con FALSE se
   * firman y se escriben en `directorioSalida` (obligatorio), solo si TODAS
   * las filas están OK (el set se reinicia completo ante un rechazo).
   */
  dryRun?: boolean;
  directorioSalida?: string;
}

export interface ReporteSetPruebas {
  dryRun: boolean;
  /** Siempre false: este módulo NO transmite nada a la DGII/CerteCF. */
  transmitido: false;
  totalFilas: number;
  ok: number;
  conErrores: number;
  /** true si los XML quedaron firmados y escritos en disco. */
  firmado: boolean;
  /** Certificado usado al firmar (solo si firmado). El de 'desarrollo' NO sirve para CerteCF. */
  certificado?: 'desarrollo' | 'p12-real';
  hojasOmitidas: { nombre: string; motivo: string }[];
  /** Encabezados de columna presentes en el Excel con datos que no se mapean a ningún campo. */
  columnasNoSoportadas: string[];
  filas: ResultadoFila[];
  mensajes: string[];
}
