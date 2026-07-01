'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { createEcf } from '@/lib/api';
import { CreateLineaEcfDto } from '@/lib/types';

interface LineaForm {
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuentoLinea: string;
}

const LINEA_VACIA: LineaForm = {
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  descuentoLinea: '0',
};

function calcularLinea(linea: LineaForm) {
  const cant = parseFloat(linea.cantidad) || 0;
  const precio = parseFloat(linea.precioUnitario) || 0;
  const desc = parseFloat(linea.descuentoLinea) || 0;
  const subtotal = cant * precio - desc;
  const itbis = subtotal * 0.18;
  const total = subtotal + itbis;
  return { subtotal, itbis, total };
}

function formatRD(n: number) {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NuevaEcfPage() {
  return (
    <AuthGuard>
      <NuevaEcfContent />
    </AuthGuard>
  );
}

function NuevaEcfContent() {
  const router = useRouter();

  // Emisor
  const [rncEmisor, setRncEmisor] = useState('');
  const [nombreEmisor, setNombreEmisor] = useState('');

  // Comprador
  const [rncComprador, setRncComprador] = useState('');
  const [nombreComprador, setNombreComprador] = useState('');

  // Líneas
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Totales
  const totales = lineas.reduce(
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

    // Validate lineas
    const lineasValidas = lineas.filter(
      (l) => l.descripcion.trim() && parseFloat(l.cantidad) > 0 && parseFloat(l.precioUnitario) > 0,
    );
    if (lineasValidas.length === 0) {
      setError('Agrega al menos una línea válida con descripción, cantidad y precio.');
      return;
    }

    setLoading(true);
    try {
      const dto = {
        tipoEcf: 'e-CF_31_v_1_0',
        rncEmisor: rncEmisor.trim(),
        nombreEmisor: nombreEmisor.trim(),
        rncComprador: rncComprador.trim(),
        nombreComprador: nombreComprador.trim(),
        moneda: 'RD',
        lineas: lineasValidas.map(
          (l): CreateLineaEcfDto => ({
            descripcion: l.descripcion.trim(),
            cantidad: parseFloat(l.cantidad),
            precioUnitario: parseFloat(l.precioUnitario),
            descuentoLinea: parseFloat(l.descuentoLinea) || 0,
          }),
        ),
      };

      const ecf = await createEcf(dto);
      router.push(`/ecf/${ecf.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear comprobante');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Comprobante Fiscal</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tipo{' '}
            <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
              E31
            </span>{' '}
            — Factura de Crédito Fiscal
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Datos del Emisor */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold">
                1
              </span>
              Datos del Emisor
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">RNC Emisor *</label>
                <input
                  type="text"
                  required
                  value={rncEmisor}
                  onChange={(e) => setRncEmisor(e.target.value)}
                  placeholder="101-12345-6"
                  className="input-field"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="label">Nombre / Razón Social Emisor *</label>
                <input
                  type="text"
                  required
                  value={nombreEmisor}
                  onChange={(e) => setNombreEmisor(e.target.value)}
                  placeholder="Mi Empresa, S.R.L."
                  className="input-field"
                />
              </div>
            </div>
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
                <label className="label">RNC Comprador *</label>
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
                <label className="label">Nombre / Razón Social Comprador *</label>
                <input
                  type="text"
                  required
                  value={nombreComprador}
                  onChange={(e) => setNombreComprador(e.target.value)}
                  placeholder="Empresa Compradora, S.A."
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Líneas de detalle */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold">
                3
              </span>
              Líneas de Detalle
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 min-w-[200px]">
                      Descripción
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 w-20">
                      Cant.
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 w-28">
                      Precio Unit.
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 w-24">
                      Descuento
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 w-28">
                      ITBIS (18%)
                    </th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 w-28">
                      Total
                    </th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lineas.map((linea, i) => {
                    const { itbis, total } = calcularLinea(linea);
                    return (
                      <tr key={i}>
                        <td className="py-2 pr-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            required
                            value={linea.descripcion}
                            onChange={(e) => updateLinea(i, 'descripcion', e.target.value)}
                            placeholder="Descripción del bien o servicio"
                            className="input-field text-xs"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={linea.cantidad}
                            onChange={(e) => updateLinea(i, 'cantidad', e.target.value)}
                            className="input-field text-xs text-right"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={linea.precioUnitario}
                            onChange={(e) => updateLinea(i, 'precioUnitario', e.target.value)}
                            placeholder="0.00"
                            className="input-field text-xs text-right"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={linea.descuentoLinea}
                            onChange={(e) => updateLinea(i, 'descuentoLinea', e.target.value)}
                            className="input-field text-xs text-right"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right text-gray-500 text-xs whitespace-nowrap">
                          {formatRD(itbis)}
                        </td>
                        <td className="py-2 pr-2 text-right font-medium text-gray-900 text-xs whitespace-nowrap">
                          {formatRD(total)}
                        </td>
                        <td className="py-2">
                          {lineas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLinea(i)}
                              className="text-red-400 hover:text-red-600 transition-colors p-1"
                              title="Eliminar línea"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add line */}
            <button
              type="button"
              onClick={addLinea}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <span className="text-lg leading-none">+</span> Agregar línea
            </button>

            {/* Totales */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatRD(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>ITBIS (18%)</span>
                  <span>{formatRD(totales.itbis)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1.5 mt-1.5">
                  <span>Total</span>
                  <span>{formatRD(totales.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-primary px-6">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando…
                </span>
              ) : (
                'Crear Comprobante'
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
