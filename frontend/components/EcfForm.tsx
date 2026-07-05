'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEcf, updateEcf } from '@/lib/api';
import { CreateLineaEcfDto, Ecf } from '@/lib/types';
import {
  BIEN_O_SERVICIO,
  TASA_ITBIS,
  TIPOS_CON_RETENCION,
  TIPOS_ECF,
  TIPOS_INGRESO,
  TIPOS_PAGO,
  TIPOS_RETENCION_REQUERIDA,
  UNIDADES_MEDIDA,
} from '@/lib/constants-dgii';

interface LineaForm {
  descripcion: string;
  indicadorBienoServicio: string;
  unidadMedida: string;
  indicadorFacturacion: string; // IndicadorFacturacion: 1=18%, 2=16%, 3=0%, 4=Exento
  cantidad: string;
  precioUnitario: string;
  descuentoLinea: string;
  indicadorRetencion: string; // '' | '1' (Retención) | '2' (Percepción)
  montoItbisRetenido: string;
  montoIsrRetenido: string;
}

const LINEA_VACIA: LineaForm = {
  descripcion: '',
  indicadorBienoServicio: '1',
  unidadMedida: '43', // Unidad
  indicadorFacturacion: '1',
  cantidad: '1',
  precioUnitario: '',
  descuentoLinea: '0',
  indicadorRetencion: '',
  montoItbisRetenido: '',
  montoIsrRetenido: '',
};

// Debe reflejar exactamente EcfService.TASA_POR_INDICADOR (backend).
const TASA_POR_INDICADOR: Record<string, number> = { '1': 0.18, '2': 0.16, '3': 0, '4': 0 };

// Debe reflejar exactamente XsdValidatorService.calculateLineTotal (backend)
// para que el preview en pantalla no difiera en centavos del total guardado.
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcularLinea(linea: LineaForm) {
  const cant = parseFloat(linea.cantidad) || 0;
  const precio = parseFloat(linea.precioUnitario) || 0;
  const desc = parseFloat(linea.descuentoLinea) || 0;
  const subtotal = cant * precio - desc;
  const tasa = TASA_POR_INDICADOR[linea.indicadorFacturacion] ?? 0.18;
  const itbis = redondear(subtotal * tasa);
  const total = subtotal + itbis;
  return { subtotal, itbis, total };
}

function formatRD(n: number) {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function soloFecha(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function lineaDesdeExistente(l: NonNullable<Ecf['lineas']>[number]): LineaForm {
  return {
    descripcion: l.descripcion,
    indicadorBienoServicio: String(l.indicadorBienoServicio ?? 1),
    unidadMedida: l.unidadMedida ? String(l.unidadMedida) : '',
    indicadorFacturacion: String(l.indicadorFacturacion ?? 1),
    cantidad: String(l.cantidad),
    precioUnitario: String(l.precioUnitario),
    descuentoLinea: String(l.descuentoLinea ?? 0),
    indicadorRetencion: l.indicadorAgenteRetencionoPercepcion
      ? String(l.indicadorAgenteRetencionoPercepcion)
      : '',
    montoItbisRetenido: l.montoItbisRetenido ? String(l.montoItbisRetenido) : '',
    montoIsrRetenido: l.montoIsrRetenido ? String(l.montoIsrRetenido) : '',
  };
}

interface EcfFormProps {
  modo: 'crear' | 'editar';
  ecfExistente?: Ecf;
}

export default function EcfForm({ modo, ecfExistente }: EcfFormProps) {
  const router = useRouter();

  // Tipo de comprobante
  const [tipoEcf, setTipoEcf] = useState(ecfExistente?.tipoEcf ?? 'e-CF_31_v_1_0');
  const [fechaEmision, setFechaEmision] = useState(
    ecfExistente ? soloFecha(ecfExistente.fechaEmision) : new Date().toISOString().slice(0, 10),
  );
  const [tipoPago, setTipoPago] = useState(String(ecfExistente?.tipoPago ?? 1));
  const [tipoIngresos, setTipoIngresos] = useState(ecfExistente?.tipoIngresos ?? '01');
  const [terminoPago, setTerminoPago] = useState(ecfExistente?.terminoPago ?? '');

  const soportaRetencion = TIPOS_CON_RETENCION.includes(tipoEcf);
  const retencionRequerida = TIPOS_RETENCION_REQUERIDA.includes(tipoEcf);

  // Comprador
  const [rncComprador, setRncComprador] = useState(ecfExistente?.rncComprador ?? '');
  const [idExtranjeroComprador, setIdExtranjeroComprador] = useState(
    ecfExistente?.idExtranjeroComprador ?? '',
  );
  const [nombreComprador, setNombreComprador] = useState(ecfExistente?.nombreComprador ?? '');
  const [telefonoComprador, setTelefonoComprador] = useState(ecfExistente?.telefonoComprador ?? '');
  const [correoComprador, setCorreoComprador] = useState(ecfExistente?.correoComprador ?? '');
  const [direccionComprador, setDireccionComprador] = useState(
    ecfExistente?.direccionComprador ?? '',
  );
  const [provinciaComprador, setProvinciaComprador] = useState(
    ecfExistente?.provinciaComprador ?? '',
  );
  const [municipioComprador, setMunicipioComprador] = useState(
    ecfExistente?.municipioComprador ?? '',
  );
  const [comentarioComprador, setComentarioComprador] = useState(
    ecfExistente?.comentarioComprador ?? '',
  );

  // Propina Legal (a nivel de todo el comprobante, no por línea)
  const [aplicaPropinaLegal, setAplicaPropinaLegal] = useState(
    ecfExistente?.aplicaPropinaLegal ?? false,
  );

  // Líneas
  const [lineas, setLineas] = useState<LineaForm[]>(
    ecfExistente?.lineas && ecfExistente.lineas.length > 0
      ? ecfExistente.lineas.map(lineaDesdeExistente)
      : [{ ...LINEA_VACIA }],
  );

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Totales (incluye estimado de propina legal para mostrar en pantalla)
  const totalesLineas = lineas.reduce(
    (acc, l) => {
      const { subtotal, itbis, total } = calcularLinea(l);
      return {
        subtotal: acc.subtotal + subtotal,
        itbis: acc.itbis + itbis,
        total: acc.total + total,
      };
    },
    { subtotal: 0, itbis: 0, total: 0 },
  );
  // Igual que EcfService.calcularLineasYTotales (backend): 10% sobre el
  // subtotal gravado de todas las líneas, redondeado a 2 decimales.
  const propinaEstimada = aplicaPropinaLegal ? redondear(totalesLineas.subtotal * 0.1) : 0;
  const totales = { ...totalesLineas, total: totalesLineas.total + propinaEstimada };

  // Línea handlers
  function updateLinea(index: number, field: keyof LineaForm, value: string) {
    setLineas((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addLinea() {
    setLineas((prev) => [...prev, { ...LINEA_VACIA }]);
  }

  function removeLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const lineasValidas = lineas.filter(
      (l) => l.descripcion.trim() && parseFloat(l.cantidad) > 0 && parseFloat(l.precioUnitario) > 0,
    );
    if (lineasValidas.length === 0) {
      setError('Agrega al menos una línea válida con descripción, cantidad y precio.');
      return;
    }

    if (retencionRequerida && lineasValidas.some((l) => !l.indicadorRetencion)) {
      setError(
        `El tipo ${tipoEcf} exige indicar Retención/Percepción en cada línea (la DGII lo requiere para este tipo de comprobante).`,
      );
      return;
    }

    setLoading(true);
    try {
      const lineasDto: CreateLineaEcfDto[] = lineasValidas.map((l) => {
        const linea: CreateLineaEcfDto = {
          descripcion: l.descripcion.trim(),
          indicadorBienoServicio: parseInt(l.indicadorBienoServicio, 10),
          unidadMedida: l.unidadMedida ? parseInt(l.unidadMedida, 10) : undefined,
          indicadorFacturacion: parseInt(l.indicadorFacturacion, 10),
          cantidad: parseFloat(l.cantidad),
          precioUnitario: parseFloat(l.precioUnitario),
          descuentoLinea: parseFloat(l.descuentoLinea) || 0,
        };
        if (soportaRetencion && l.indicadorRetencion) {
          linea.indicadorAgenteRetencionoPercepcion = parseInt(l.indicadorRetencion, 10);
          if (l.montoItbisRetenido) linea.montoItbisRetenido = parseFloat(l.montoItbisRetenido);
          if (l.montoIsrRetenido) linea.montoIsrRetenido = parseFloat(l.montoIsrRetenido);
        }
        return linea;
      });

      const dto = {
        tipoEcf,
        fechaEmision: fechaEmision || undefined,
        tipoPago: parseInt(tipoPago, 10),
        tipoIngresos,
        terminoPago: terminoPago.trim() || undefined,
        rncComprador: rncComprador.trim(),
        idExtranjeroComprador: idExtranjeroComprador.trim() || undefined,
        nombreComprador: nombreComprador.trim(),
        telefonoComprador: telefonoComprador.trim() || undefined,
        correoComprador: correoComprador.trim() || undefined,
        direccionComprador: direccionComprador.trim() || undefined,
        provinciaComprador: provinciaComprador.trim() || undefined,
        municipioComprador: municipioComprador.trim() || undefined,
        comentarioComprador: comentarioComprador.trim() || undefined,
        moneda: 'RD',
        aplicaPropinaLegal,
        lineas: lineasDto,
      };

      const ecf =
        modo === 'editar' && ecfExistente
          ? await updateEcf(ecfExistente.id, dto)
          : await createEcf(dto);
      router.push(`/ecf/${ecf.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar comprobante');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tipo de comprobante */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold">
            1
          </span>
          Tipo de Comprobante
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo e-CF *</label>
            <select
              value={tipoEcf}
              onChange={(e) => setTipoEcf(e.target.value)}
              className="input-field"
            >
              {TIPOS_ECF.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha de Emisión *</label>
            <input
              type="date"
              required
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Tipo de Pago</label>
            <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className="input-field">
              {TIPOS_PAGO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Ingreso</label>
            <select
              value={tipoIngresos}
              onChange={(e) => setTipoIngresos(e.target.value)}
              className="input-field"
            >
              {TIPOS_INGRESO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Término de Pago</label>
            <input
              type="text"
              value={terminoPago}
              onChange={(e) => setTerminoPago(e.target.value)}
              placeholder="Ej: 30 días"
              maxLength={15}
              className="input-field"
            />
          </div>
        </div>
        {retencionRequerida && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Este tipo requiere indicar Retención/Percepción en cada línea de detalle.
          </p>
        )}
      </div>

      {/* Datos del Comprador */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold">
            2
          </span>
          Datos del Comprador
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">RNC / Cédula *</label>
            <input
              type="text"
              required
              value={rncComprador}
              onChange={(e) => setRncComprador(e.target.value)}
              placeholder="101-98765-4"
              className="input-field"
              maxLength={20}
            />
          </div>
          <div>
            <label className="label">ID Extranjero</label>
            <input
              type="text"
              value={idExtranjeroComprador}
              onChange={(e) => setIdExtranjeroComprador(e.target.value)}
              placeholder="Solo si el comprador es extranjero"
              className="input-field"
              maxLength={20}
            />
          </div>
          <div>
            <label className="label">Razón Social *</label>
            <input
              type="text"
              required
              value={nombreComprador}
              onChange={(e) => setNombreComprador(e.target.value)}
              placeholder="Empresa Compradora, S.A."
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input
              type="text"
              value={telefonoComprador}
              onChange={(e) => setTelefonoComprador(e.target.value)}
              placeholder="809-123-4567"
              className="input-field"
              maxLength={50}
            />
          </div>
          <div>
            <label className="label">Correo Electrónico</label>
            <input
              type="email"
              value={correoComprador}
              onChange={(e) => setCorreoComprador(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input
              type="text"
              value={direccionComprador}
              onChange={(e) => setDireccionComprador(e.target.value)}
              className="input-field"
              maxLength={100}
            />
          </div>
          <div>
            <label className="label">Provincia</label>
            <input
              type="text"
              value={provinciaComprador}
              onChange={(e) => setProvinciaComprador(e.target.value)}
              className="input-field"
              maxLength={100}
            />
          </div>
          <div>
            <label className="label">Municipio</label>
            <input
              type="text"
              value={municipioComprador}
              onChange={(e) => setMunicipioComprador(e.target.value)}
              className="input-field"
              maxLength={100}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Comentarios</label>
            <textarea
              value={comentarioComprador}
              onChange={(e) => setComentarioComprador(e.target.value)}
              maxLength={150}
              rows={2}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Líneas de detalle */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold">
              3
            </span>
            Líneas de Detalle
          </h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={aplicaPropinaLegal}
              onChange={(e) => setAplicaPropinaLegal(e.target.checked)}
              className="rounded border-gray-300"
            />
            Aplicar Propina Legal (10%)
          </label>
        </div>

        <div className="space-y-4">
          {lineas.map((linea, i) => {
            const { subtotal, itbis, total } = calcularLinea(linea);
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50/40">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-xs font-semibold text-gray-400 mt-2.5">
                    Línea {i + 1}
                  </span>
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLinea(i)}
                      className="text-red-400 hover:text-red-600 transition-colors text-sm font-medium"
                      title="Eliminar línea"
                    >
                      Eliminar ×
                    </button>
                  )}
                </div>

                <div className="mb-3">
                  <label className="label">Descripción *</label>
                  <input
                    type="text"
                    required
                    value={linea.descripcion}
                    onChange={(e) => updateLinea(i, 'descripcion', e.target.value)}
                    placeholder="Descripción del bien o servicio"
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="label">Bien o Servicio</label>
                    <select
                      value={linea.indicadorBienoServicio}
                      onChange={(e) => updateLinea(i, 'indicadorBienoServicio', e.target.value)}
                      className="input-field"
                    >
                      {BIEN_O_SERVICIO.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Unidad de Medida</label>
                    <select
                      value={linea.unidadMedida}
                      onChange={(e) => updateLinea(i, 'unidadMedida', e.target.value)}
                      className="input-field"
                    >
                      <option value="">—</option>
                      {UNIDADES_MEDIDA.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Cantidad *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={linea.cantidad}
                      onChange={(e) => updateLinea(i, 'cantidad', e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="label">Precio (RD$) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={linea.precioUnitario}
                      onChange={(e) => updateLinea(i, 'precioUnitario', e.target.value)}
                      placeholder="0.00"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label">Descuento (RD$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={linea.descuentoLinea}
                      onChange={(e) => updateLinea(i, 'descuentoLinea', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label">Itbis</label>
                    <select
                      value={linea.indicadorFacturacion}
                      onChange={(e) => updateLinea(i, 'indicadorFacturacion', e.target.value)}
                      className="input-field"
                    >
                      {TASA_ITBIS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {soportaRetencion && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="label">
                        Retención{retencionRequerida ? ' *' : ''}
                      </label>
                      <select
                        required={retencionRequerida}
                        value={linea.indicadorRetencion}
                        onChange={(e) => updateLinea(i, 'indicadorRetencion', e.target.value)}
                        className="input-field"
                      >
                        <option value="">— Ninguna —</option>
                        <option value="1">Retención</option>
                        <option value="2">Percepción</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">ITBIS Retenido (RD$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.montoItbisRetenido}
                        onChange={(e) => updateLinea(i, 'montoItbisRetenido', e.target.value)}
                        placeholder="0.00"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">ISR Retenido (RD$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.montoIsrRetenido}
                        onChange={(e) => updateLinea(i, 'montoIsrRetenido', e.target.value)}
                        placeholder="0.00"
                        className="input-field"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 border-t border-gray-200 pt-3">
                  <span>
                    Subtotal: <span className="font-medium text-gray-800">{formatRD(subtotal)}</span>
                  </span>
                  <span>
                    ITBIS: <span className="font-medium text-gray-800">{formatRD(itbis)}</span>
                  </span>
                  <span>
                    Valor: <span className="font-semibold text-gray-900">{formatRD(total)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addLinea}
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <span className="text-lg leading-none">+</span> Agregar línea
        </button>

        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatRD(totalesLineas.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>ITBIS</span>
              <span>{formatRD(totalesLineas.itbis)}</span>
            </div>
            {aplicaPropinaLegal && (
              <div className="flex justify-between text-gray-600">
                <span>Propina Legal (10%)</span>
                <span>{formatRD(propinaEstimada)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1.5 mt-1.5">
              <span>Total</span>
              <span>{formatRD(totales.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="btn-primary px-6">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Guardando…
            </span>
          ) : modo === 'editar' ? (
            'Guardar Cambios'
          ) : (
            'Crear Comprobante'
          )}
        </button>
      </div>
    </form>
  );
}
