// Catálogos DGII usados en los formularios de e-CF (valores fijos de los XSD oficiales).

export const TIPOS_ECF = [
  { value: 'e-CF_31_v_1_0', label: 'E31 — Factura de Crédito Fiscal' },
  { value: 'e-CF_32_v_1_0', label: 'E32 — Factura de Consumo' },
  { value: 'e-CF_33_v_1_0', label: 'E33 — Nota de Débito' },
  { value: 'e-CF_34_v_1_0', label: 'E34 — Nota de Crédito' },
  { value: 'e-CF_41_v_1_0', label: 'E41 — Comprobante de Compras' },
  { value: 'e-CF_43_v_1_0', label: 'E43 — Comprobante Gastos Menores' },
  { value: 'e-CF_44_v_1_0', label: 'E44 — Comprobante Regímenes Especiales' },
  { value: 'e-CF_45_v_1_0', label: 'E45 — Comprobante Gubernamental' },
  { value: 'e-CF_46_v_1_0', label: 'E46 — Comprobante para Exportaciones' },
  { value: 'e-CF_47_v_1_0', label: 'E47 — Comprobante Pagos al Exterior' },
];

// Tipos cuyo XSD define el bloque <Retencion> por línea (31/33/34 opcional, 41 obligatorio)
export const TIPOS_CON_RETENCION = ['e-CF_31_v_1_0', 'e-CF_33_v_1_0', 'e-CF_34_v_1_0', 'e-CF_41_v_1_0'];
export const TIPOS_RETENCION_REQUERIDA = ['e-CF_41_v_1_0'];

// TipoPagoType
export const TIPOS_PAGO = [
  { value: 1, label: 'Contado' },
  { value: 2, label: 'Crédito' },
  { value: 3, label: 'Gratuito' },
];

// TipoIngresosValidationType
export const TIPOS_INGRESO = [
  { value: '01', label: 'Ingresos por operaciones (No financieros)' },
  { value: '02', label: 'Ingresos Financieros' },
  { value: '03', label: 'Ingresos Extraordinarios' },
  { value: '04', label: 'Ingresos por Arrendamientos' },
  { value: '05', label: 'Ingresos por Venta de Activo Depreciable' },
  { value: '06', label: 'Otros Ingresos' },
];

// IndicadorBienoServicioType
export const BIEN_O_SERVICIO = [
  { value: 1, label: 'Bien' },
  { value: 2, label: 'Servicio' },
];

// IndicadorFacturacionType (tasa de ITBIS aplicada a la línea)
export const TASA_ITBIS = [
  { value: 1, label: '18%' },
  { value: 2, label: '16%' },
  { value: 3, label: '0%' },
  { value: 4, label: 'Exento' },
];

// UnidadMedidaType (XSD e-CF, códigos 1-54)
export const UNIDADES_MEDIDA = [
  { value: 1, label: 'Barril' },
  { value: 2, label: 'Bolsa' },
  { value: 3, label: 'Bote' },
  { value: 4, label: 'Bultos' },
  { value: 5, label: 'Botella' },
  { value: 6, label: 'Caja/Cajón' },
  { value: 7, label: 'Cajetilla' },
  { value: 8, label: 'Centímetro' },
  { value: 9, label: 'Cilindro' },
  { value: 10, label: 'Conjunto' },
  { value: 11, label: 'Contenedor' },
  { value: 12, label: 'Día' },
  { value: 13, label: 'Docena' },
  { value: 14, label: 'Fardo' },
  { value: 15, label: 'Galones' },
  { value: 16, label: 'Grado' },
  { value: 17, label: 'Gramo' },
  { value: 18, label: 'Granel' },
  { value: 19, label: 'Hora' },
  { value: 20, label: 'Huacal' },
  { value: 21, label: 'Kilogramo' },
  { value: 22, label: 'Kilovatio Hora' },
  { value: 23, label: 'Libra' },
  { value: 24, label: 'Litro' },
  { value: 25, label: 'Lote' },
  { value: 26, label: 'Metro' },
  { value: 27, label: 'Metro Cuadrado' },
  { value: 28, label: 'Metro Cúbico' },
  { value: 29, label: 'Millones de Unidades Térmicas' },
  { value: 30, label: 'Minuto' },
  { value: 31, label: 'Paquete' },
  { value: 32, label: 'Par' },
  { value: 33, label: 'Pie' },
  { value: 34, label: 'Pieza' },
  { value: 35, label: 'Rollo' },
  { value: 36, label: 'Sobre' },
  { value: 37, label: 'Segundo' },
  { value: 38, label: 'Tanque' },
  { value: 39, label: 'Tonelada' },
  { value: 40, label: 'Tubo' },
  { value: 41, label: 'Yarda' },
  { value: 42, label: 'Yarda cuadrada' },
  { value: 43, label: 'Unidad' },
  { value: 44, label: 'Elemento' },
  { value: 45, label: 'Millar' },
  { value: 46, label: 'Saco' },
  { value: 47, label: 'Lata' },
  { value: 48, label: 'Display' },
  { value: 49, label: 'Bidón' },
  { value: 50, label: 'Ración' },
  { value: 51, label: 'Quintal' },
  { value: 52, label: 'Toneladas de registro bruto' },
  { value: 53, label: 'Pie Cuadrado' },
  { value: 54, label: 'Pasajero' },
];

export const ESTADO_LABEL: Record<string, string> = {
  draft: 'Borrador',
  validated: 'Validado',
  signed: 'Firmado',
  transmitted: 'Transmitido',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Anulado',
};

// Subconjunto de estados que representan una respuesta de la DGII (para el
// filtro "Estado en DGII", que en nuestro modelo es el mismo campo `estado`).
export const ESTADOS_DGII = ['transmitted', 'accepted', 'rejected', 'cancelled'];
