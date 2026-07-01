'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { getResumenReporte, descargarReporteCsv, ReporteFiltros } from '@/lib/api';
import { ResumenReporte } from '@/lib/types';

const ESTADO_LABEL: Record<string, string> = {
  draft: 'Borrador',
  validated: 'Validado',
  signed: 'Firmado',
  transmitted: 'Transmitido',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Anulado',
};

function formatRD(n: number) {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReportesPage() {
  return (
    <AuthGuard>
      <ReportesContent />
    </AuthGuard>
  );
}

function ReportesContent() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [resumen, setResumen] = useState<ResumenReporte | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);

  const filtros: ReporteFiltros = {
    desde: desde || undefined,
    hasta: hasta || undefined,
    estado: estado || undefined,
  };

  async function cargar() {
    setLoading(true);
    setError('');
    try {
      const data = await getResumenReporte(filtros);
      setResumen(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar el reporte');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDescargar() {
    setDescargando(true);
    try {
      await descargarReporteCsv(filtros);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al descargar CSV');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Resumen de comprobantes fiscales emitidos
          </p>
        </div>

        {/* Filtros */}
        <div className="card p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="input-field"
              >
                <option value="">Todos los estados</option>
                {Object.entries(ESTADO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={cargar} className="btn-secondary flex-1">
                Filtrar
              </button>
              <button
                onClick={handleDescargar}
                disabled={descargando}
                className="btn-primary flex-1"
              >
                {descargando ? 'Generando…' : '↓ CSV'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && resumen && (
          <div className="space-y-6">
            {/* Tarjetas de totales */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card p-5">
                <p className="text-xs font-semibold text-gray-500 mb-1">Comprobantes</p>
                <p className="text-2xl font-bold text-gray-900">{resumen.cantidad}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-gray-500 mb-1">Monto Total</p>
                <p className="text-2xl font-bold text-gray-900">{formatRD(resumen.montoTotal)}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-gray-500 mb-1">ITBIS</p>
                <p className="text-2xl font-bold text-gray-900">{formatRD(resumen.montoITBIS)}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold text-gray-500 mb-1">Retenciones</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatRD(resumen.montoItbisRetenido + resumen.montoRentaRetenido)}
                </p>
              </div>
            </div>

            {/* Por estado */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Por Estado</h2>
              {Object.keys(resumen.porEstado).length === 0 ? (
                <p className="text-sm text-gray-400">Sin comprobantes en el rango seleccionado.</p>
              ) : (
                <dl className="space-y-2">
                  {Object.entries(resumen.porEstado).map(([estadoKey, cantidad]) => (
                    <div key={estadoKey} className="flex justify-between text-sm">
                      <dt className="text-gray-600">{ESTADO_LABEL[estadoKey] ?? estadoKey}</dt>
                      <dd className="font-medium text-gray-900">{cantidad}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {/* Por tipo */}
            <div className="card p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Por Tipo de e-CF</h2>
              {Object.keys(resumen.porTipo).length === 0 ? (
                <p className="text-sm text-gray-400">Sin comprobantes en el rango seleccionado.</p>
              ) : (
                <dl className="space-y-2">
                  {Object.entries(resumen.porTipo).map(([tipo, cantidad]) => (
                    <div key={tipo} className="flex justify-between text-sm">
                      <dt className="font-mono text-gray-600">{tipo}</dt>
                      <dd className="font-medium text-gray-900">{cantidad}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
