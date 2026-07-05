'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { descargarXmlEcf, listEcf } from '@/lib/api';
import { Ecf, EstadoEcf } from '@/lib/types';
import { ESTADO_LABEL, ESTADOS_DGII, TIPOS_ECF } from '@/lib/constants-dgii';

// ── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  EstadoEcf,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft:       { label: 'Borrador',     bg: 'bg-gray-100',    text: 'text-gray-600',   dot: 'bg-gray-400'    },
  validated:   { label: 'Validado',     bg: 'bg-yellow-100',  text: 'text-yellow-700', dot: 'bg-yellow-400'  },
  signed:      { label: 'Firmado',      bg: 'bg-green-100',   text: 'text-green-700',  dot: 'bg-green-500'   },
  transmitted: { label: 'Transmitido',  bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-500'    },
  accepted:    { label: 'Aceptado',     bg: 'bg-emerald-100', text: 'text-emerald-700',dot: 'bg-emerald-500' },
  rejected:    { label: 'Rechazado',    bg: 'bg-red-100',     text: 'text-red-700',    dot: 'bg-red-500'     },
  cancelled:   { label: 'Anulado',      bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400'   },
};

function EstadoBadge({ estado }: { estado: EstadoEcf }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonto(monto: number, moneda: string): string {
  const symbol = moneda === 'USD' ? 'US$' : 'RD$';
  return `${symbol} ${Number(monto).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const [ecfs, setEcfs] = useState<Ecf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  // Filtros avanzados (estilo Facturador Gratuito de la DGII)
  const [tipoEcf, setTipoEcf] = useState('');
  const [encf, setEncf] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [rncComprador, setRncComprador] = useState('');

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const data = await listEcf({
        estado: estado || undefined,
        rncComprador: rncComprador || undefined,
        tipoEcf: tipoEcf || undefined,
        encf: encf || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
      });
      setEcfs(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar comprobantes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiarFiltros() {
    setTipoEcf('');
    setEncf('');
    setFechaDesde('');
    setFechaHasta('');
    setEstado('');
    setRncComprador('');
  }

  async function handleDescargarXml(id: string) {
    setDescargandoId(id);
    try {
      await descargarXmlEcf(id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al descargar XML');
    } finally {
      setDescargandoId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Consulta de Comprobantes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Cargando…' : `${ecfs.length} comprobante${ecfs.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <Link href="/ecf/nueva" className="btn-primary whitespace-nowrap">
            + Nuevo e-CF
          </Link>
        </div>

        {/* Filtros avanzados */}
        <div className="card p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Tipo e-CF</label>
              <select value={tipoEcf} onChange={(e) => setTipoEcf(e.target.value)} className="input-field">
                <option value="">Todos</option>
                {TIPOS_ECF.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">e-NCF</label>
              <input
                type="text"
                value={encf}
                onChange={(e) => setEncf(e.target.value)}
                placeholder="E310000000001"
                className="input-field"
              />
            </div>
            <div>
              <label className="label">RNC Comprador</label>
              <input
                type="text"
                value={rncComprador}
                onChange={(e) => setRncComprador(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Fecha Emisión Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Fecha Emisión Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Estado en DGII</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className="input-field">
                <option value="">Todos</option>
                {ESTADOS_DGII.map((key) => (
                  <option key={key} value={key}>
                    {ESTADO_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Estado Factura</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className="input-field">
                <option value="">Todos</option>
                {Object.entries(ESTADO_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={fetchData} className="btn-primary">
              Filtrar
            </button>
            <button onClick={limpiarFiltros} className="btn-secondary">
              Limpiar
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : ecfs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg
                className="w-12 h-12 mb-3 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm font-medium">No hay comprobantes</p>
              <p className="text-xs mt-1">
                <Link href="/ecf/nueva" className="text-blue-600 hover:underline">
                  Crear el primero
                </Link>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      e-NCF
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      RNC Comprador
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Razón Social Comprador
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Fecha Emisión
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Monto Total
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Total ITBIS
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Estado Factura
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Estado DGII
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ecfs.map((ecf) => {
                    const esBorrador = ecf.estado === 'draft';
                    const estadoDgii = ESTADOS_DGII.includes(ecf.estado)
                      ? ESTADO_LABEL[ecf.estado]
                      : '—';
                    return (
                      <tr key={ecf.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {ecf.encf ?? <span className="text-gray-300 italic">Sin asignar</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{ecf.rncComprador}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[180px]">
                            {ecf.nombreComprador}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(ecf.fechaEmision).toLocaleDateString('es-DO', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatMonto(ecf.montoTotal, ecf.moneda)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatMonto(ecf.montoITBIS, ecf.moneda)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <EstadoBadge estado={ecf.estado as EstadoEcf} />
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{estadoDgii}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3 text-xs font-medium">
                            <Link href={`/ecf/${ecf.id}`} className="text-blue-600 hover:text-blue-800">
                              Ver
                            </Link>
                            <Link
                              href={`/ecf/${ecf.id}/imprimir`}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              Imprimir
                            </Link>
                            <button
                              onClick={() => handleDescargarXml(ecf.id)}
                              disabled={descargandoId === ecf.id}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              {descargandoId === ecf.id ? 'Descargando…' : 'XML'}
                            </button>
                            {esBorrador && (
                              <Link
                                href={`/ecf/${ecf.id}/editar`}
                                className="text-amber-600 hover:text-amber-800"
                              >
                                Editar
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
