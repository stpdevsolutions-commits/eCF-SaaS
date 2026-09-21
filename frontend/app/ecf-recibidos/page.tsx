'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { emitirAprobacionComercial, listEcfRecibidos } from '@/lib/api';
import { AprobacionComercial, EcfRecibido, EstadoAcuseRecibido } from '@/lib/types';

// ── Badges ───────────────────────────────────────────────────────────────────

const ACUSE_CONFIG: Record<EstadoAcuseRecibido, { label: string; bg: string; text: string; dot: string }> = {
  recibido:    { label: 'Recibido',    bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  no_recibido: { label: 'No recibido', bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500'   },
};

function AcuseBadge({ estado }: { estado: EstadoAcuseRecibido }) {
  const cfg = ACUSE_CONFIG[estado] ?? ACUSE_CONFIG.recibido;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const APROBACION_CONFIG: Record<AprobacionComercial, { label: string; bg: string; text: string; dot: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  aceptado:  { label: 'Aceptado',  bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rechazado: { label: 'Rechazado', bg: 'bg-red-100',     text: 'text-red-700',    dot: 'bg-red-500'   },
};

function AprobacionBadge({ estado }: { estado: AprobacionComercial }) {
  const cfg = APROBACION_CONFIG[estado] ?? APROBACION_CONFIG.pendiente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonto(monto?: number): string {
  if (monto === undefined || monto === null) return '—';
  return `RD$ ${Number(monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFecha(fecha?: string): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EcfRecibidosPage() {
  return (
    <AuthGuard>
      <EcfRecibidosContent />
    </AuthGuard>
  );
}

function EcfRecibidosContent() {
  const [recibidos, setRecibidos] = useState<EcfRecibido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const data = await listEcfRecibidos();
      setRecibidos(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar los e-CF recibidos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAceptar(id: string) {
    setError('');
    setProcesandoId(id);
    try {
      const actualizado = await emitirAprobacionComercial(id, 'aceptado');
      setRecibidos((prev) => prev.map((r) => (r.id === id ? actualizado : r)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al aprobar el comprobante');
    } finally {
      setProcesandoId(null);
    }
  }

  function abrirRechazo(id: string) {
    setRechazandoId(id);
    setMotivoRechazo('');
  }

  async function confirmarRechazo(id: string) {
    if (!motivoRechazo.trim()) {
      setError('El rechazo requiere un motivo');
      return;
    }
    setError('');
    setProcesandoId(id);
    try {
      const actualizado = await emitirAprobacionComercial(id, 'rechazado', motivoRechazo.trim());
      setRecibidos((prev) => prev.map((r) => (r.id === id ? actualizado : r)));
      setRechazandoId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al rechazar el comprobante');
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">e-CF Recibidos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Cargando…'
              : `${recibidos.length} comprobante${recibidos.length !== 1 ? 's' : ''} recibido${recibidos.length !== 1 ? 's' : ''} de terceros`}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Cargando…</div>
          ) : recibidos.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              Todavía no se ha recibido ningún e-CF de terceros.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">e-NCF</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">RNC Emisor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha Emisión</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Acuse</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Aprobación Comercial</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recibidos.map((r) => (
                    <>
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.encf}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{r.rncEmisor}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatFecha(r.fechaEmision)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatMonto(r.montoTotal)}</td>
                        <td className="px-4 py-3 text-center"><AcuseBadge estado={r.estadoAcuse} /></td>
                        <td className="px-4 py-3 text-center"><AprobacionBadge estado={r.aprobacionComercial} /></td>
                        <td className="px-4 py-3">
                          {r.aprobacionComercial === 'pendiente' && r.estadoAcuse === 'recibido' ? (
                            <div className="flex items-center justify-end gap-3 text-xs font-medium">
                              <button
                                onClick={() => handleAceptar(r.id)}
                                disabled={procesandoId === r.id}
                                className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                              >
                                {procesandoId === r.id ? 'Enviando…' : 'Aceptar'}
                              </button>
                              <button
                                onClick={() => abrirRechazo(r.id)}
                                disabled={procesandoId === r.id}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 italic block text-right">Sin acciones</span>
                          )}
                        </td>
                      </tr>
                      {rechazandoId === r.id && (
                        <tr key={`${r.id}-rechazo`} className="bg-red-50/50">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                              <input
                                type="text"
                                autoFocus
                                value={motivoRechazo}
                                onChange={(e) => setMotivoRechazo(e.target.value)}
                                placeholder="Motivo del rechazo comercial (obligatorio)"
                                className="input-field flex-1"
                              />
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => confirmarRechazo(r.id)}
                                  disabled={procesandoId === r.id}
                                  className="btn-primary bg-red-600 hover:bg-red-700"
                                >
                                  {procesandoId === r.id ? 'Enviando…' : 'Confirmar rechazo'}
                                </button>
                                <button
                                  onClick={() => setRechazandoId(null)}
                                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Aceptar o rechazar aquí genera y firma la Aprobación o Rechazo Comercial (ACECF) y la
          envía a la DGII — es la respuesta de STP como comprador sobre un e-CF recibido de un
          tercero. No confundir con el Acuse de Recibo (ARECF), que se envía automáticamente al
          recibir el comprobante.
        </p>
      </main>
    </div>
  );
}
