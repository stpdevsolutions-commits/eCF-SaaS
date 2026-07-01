'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { getEcf, validateEcf, signEcf } from '@/lib/api';
import { Ecf, EstadoEcf } from '@/lib/types';

// ── Estado badge (shared config) ─────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  EstadoEcf,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft:       { label: 'Borrador',    bg: 'bg-gray-100',    text: 'text-gray-600',   dot: 'bg-gray-400'    },
  validated:   { label: 'Validado',    bg: 'bg-yellow-100',  text: 'text-yellow-700', dot: 'bg-yellow-400'  },
  signed:      { label: 'Firmado',     bg: 'bg-green-100',   text: 'text-green-700',  dot: 'bg-green-500'   },
  transmitted: { label: 'Transmitido', bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-500'    },
  accepted:    { label: 'Aceptado',    bg: 'bg-emerald-100', text: 'text-emerald-700',dot: 'bg-emerald-500' },
  rejected:    { label: 'Rechazado',   bg: 'bg-red-100',     text: 'text-red-700',    dot: 'bg-red-500'     },
  cancelled:   { label: 'Anulado',     bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400'   },
};

function EstadoBadge({ estado }: { estado: EstadoEcf }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-sm font-medium text-gray-500 sm:w-40 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 sm:mt-0 break-all">
        {value ?? <span className="text-gray-400 italic">—</span>}
      </dd>
    </div>
  );
}

function formatMonto(monto: number, moneda: string) {
  const symbol = moneda === 'USD' ? 'US$' : 'RD$';
  return `${symbol} ${Number(monto).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EcfDetailPage() {
  return (
    <AuthGuard>
      <EcfDetailContent />
    </AuthGuard>
  );
}

function EcfDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ecf, setEcf] = useState<Ecf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<'validate' | 'sign' | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showXml, setShowXml] = useState(false);

  useEffect(() => {
    loadEcf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadEcf() {
    setLoading(true);
    setError('');
    try {
      const data = await getEcf(id);
      setEcf(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar comprobante');
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate() {
    setActionLoading('validate');
    setActionMsg(null);
    try {
      const result = await validateEcf(id);
      setActionMsg({
        type: result.valid ? 'success' : 'error',
        text: result.valid
          ? 'Comprobante validado correctamente.'
          : `Validación fallida: ${(result.errors ?? []).join(', ')}`,
      });
      await loadEcf();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al validar',
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSign() {
    setActionLoading('sign');
    setActionMsg(null);
    try {
      const result = await signEcf(id);
      setActionMsg({ type: 'success', text: result.mensaje });
      await loadEcf();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al firmar',
      });
    } finally {
      setActionLoading(null);
    }
  }

  const canValidate = ecf && ['draft', 'validated'].includes(ecf.estado);
  const canSign = ecf && ['draft', 'validated'].includes(ecf.estado);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
        >
          ← Volver al listado
        </button>

        {/* Error de carga */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && ecf && (
          <div className="space-y-6">
            {/* Header card */}
            <div className="card p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded text-sm">
                      {ecf.tipoEcf}
                    </span>
                    <EstadoBadge estado={ecf.estado as EstadoEcf} />
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-1">{ecf.id}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {canValidate && (
                    <button
                      onClick={handleValidate}
                      disabled={actionLoading !== null}
                      className="btn-secondary text-sm"
                    >
                      {actionLoading === 'validate' ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                          Validando…
                        </span>
                      ) : (
                        '✓ Validar'
                      )}
                    </button>
                  )}
                  {canSign && (
                    <button
                      onClick={handleSign}
                      disabled={actionLoading !== null}
                      className="btn-primary text-sm"
                    >
                      {actionLoading === 'sign' ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Firmando…
                        </span>
                      ) : (
                        '🔏 Firmar'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Action message */}
              {actionMsg && (
                <div
                  className={`mt-4 p-3 rounded-lg text-sm ${
                    actionMsg.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {actionMsg.text}
                </div>
              )}
            </div>

            {/* Datos generales */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Datos Generales</h2>
              <dl className="space-y-3">
                <InfoRow label="Fecha de Emisión" value={new Date(ecf.fechaEmision).toLocaleString('es-DO')} />
                <InfoRow label="Moneda" value={ecf.moneda} />
                <InfoRow label="UUID DGII" value={ecf.uuid} />
                <InfoRow label="Código de Seguridad" value={ecf.codigoSeguridadDgii} />
              </dl>
            </div>

            {/* Emisor / Comprador */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Emisor</h2>
                <dl className="space-y-3">
                  <InfoRow label="RNC" value={ecf.rncEmisor} />
                  <InfoRow label="Nombre" value={ecf.nombreEmisor} />
                </dl>
              </div>
              <div className="card p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Comprador</h2>
                <dl className="space-y-3">
                  <InfoRow label="RNC" value={ecf.rncComprador} />
                  <InfoRow label="Nombre" value={ecf.nombreComprador} />
                </dl>
              </div>
            </div>

            {/* Líneas de detalle */}
            {ecf.lineas && ecf.lineas.length > 0 && (() => {
              const tieneRetencion = ecf.lineas.some((l) => l.indicadorAgenteRetencionoPercepcion);
              return (
              <div className="card p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Líneas de Detalle</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500">#</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500">Descripción</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500">Cant.</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500">Precio Unit.</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500">Descuento</th>
                        {tieneRetencion && (
                          <>
                            <th className="pb-2 text-left text-xs font-semibold text-gray-500">Retención</th>
                            <th className="pb-2 text-right text-xs font-semibold text-gray-500">ITBIS Ret.</th>
                            <th className="pb-2 text-right text-xs font-semibold text-gray-500">ISR Ret.</th>
                          </>
                        )}
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500">ITBIS</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ecf.lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td className="py-2 pr-3 text-gray-400 text-xs">{linea.numero}</td>
                          <td className="py-2 pr-3 text-gray-900">{linea.descripcion}</td>
                          <td className="py-2 pr-3 text-right text-gray-700">{linea.cantidad}</td>
                          <td className="py-2 pr-3 text-right text-gray-700">
                            {formatMonto(linea.precioUnitario, ecf.moneda)}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-500">
                            {Number(linea.descuentoLinea) > 0
                              ? formatMonto(linea.descuentoLinea, ecf.moneda)
                              : '—'}
                          </td>
                          {tieneRetencion && (
                            <>
                              <td className="py-2 pr-3 text-gray-700">
                                {linea.indicadorAgenteRetencionoPercepcion === 1
                                  ? 'Retención'
                                  : linea.indicadorAgenteRetencionoPercepcion === 2
                                    ? 'Percepción'
                                    : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-700">
                                {linea.montoItbisRetenido ? formatMonto(linea.montoItbisRetenido, ecf.moneda) : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-700">
                                {linea.montoIsrRetenido ? formatMonto(linea.montoIsrRetenido, ecf.moneda) : '—'}
                              </td>
                            </>
                          )}
                          <td className="py-2 pr-3 text-right text-gray-700">
                            {formatMonto(linea.itbis, ecf.moneda)}
                          </td>
                          <td className="py-2 font-medium text-right text-gray-900">
                            {formatMonto(linea.subtotal, ecf.moneda)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totales */}
                <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                  <div className="w-64 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Descuento total</span>
                      <span>{formatMonto(ecf.montoDescuento, ecf.moneda)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>ITBIS total</span>
                      <span>{formatMonto(ecf.montoITBIS, ecf.moneda)}</span>
                    </div>
                    {Number(ecf.montoItbisRetenido) > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>ITBIS retenido</span>
                        <span>-{formatMonto(ecf.montoItbisRetenido, ecf.moneda)}</span>
                      </div>
                    )}
                    {Number(ecf.montoRentaRetenido) > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>ISR retenido</span>
                        <span>-{formatMonto(ecf.montoRentaRetenido, ecf.moneda)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1.5 mt-1.5">
                      <span>Total</span>
                      <span>{formatMonto(ecf.montoTotal, ecf.moneda)}</span>
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* XML Firmado (collapsible) */}
            {ecf.xmlFirmado && (
              <div className="card p-6">
                <button
                  onClick={() => setShowXml((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h2 className="text-base font-semibold text-gray-900">XML Firmado</h2>
                  <span className="text-gray-400 text-sm">{showXml ? '▲ Ocultar' : '▼ Mostrar'}</span>
                </button>
                {showXml && (
                  <pre className="mt-4 p-4 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-96">
                    {ecf.xmlFirmado}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
