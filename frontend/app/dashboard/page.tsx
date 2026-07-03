'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { listEcf } from '@/lib/api';
import { Ecf, EstadoEcf } from '@/lib/types';

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

function formatTipoEcf(tipo: string): string {
  // e.g. 'E31' → 'E31', 'e-CF_31_v_1_0' → 'E31'
  const match = tipo.match(/(\d{2})/);
  return match ? `E${match[1]}` : tipo;
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
  const [filtroEstado, setFiltroEstado] = useState('');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const data = await listEcf(filtroEstado ? { estado: filtroEstado } : undefined);
      setEcfs(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar comprobantes');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Comprobantes Fiscales</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? 'Cargando…' : `${ecfs.length} comprobante${ecfs.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Estado filter */}
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="input-field w-auto text-sm"
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>

            <Link href="/ecf/nueva" className="btn-primary whitespace-nowrap">
              + Nuevo e-CF
            </Link>
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
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      eNCF / UUID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Comprador
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Monto Total
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Fecha
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ecfs.map((ecf) => (
                    <tr key={ecf.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
                          {formatTipoEcf(ecf.tipoEcf)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {ecf.uuid ? (
                          <span className="truncate max-w-[120px] block" title={ecf.uuid}>
                            {ecf.uuid.substring(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-gray-300 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">
                          {ecf.nombreComprador}
                        </p>
                        <p className="text-xs text-gray-400">{ecf.rncComprador}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatMonto(ecf.montoTotal, ecf.moneda)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <EstadoBadge estado={ecf.estado as EstadoEcf} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(ecf.fechaEmision).toLocaleDateString('es-DO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/ecf/${ecf.id}`}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
