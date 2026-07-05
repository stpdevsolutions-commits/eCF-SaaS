'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import AuthGuard from '@/components/AuthGuard';
import { getEcf, getEmpresa } from '@/lib/api';
import { Ecf } from '@/lib/types';
import { TIPOS_ECF, UNIDADES_MEDIDA } from '@/lib/constants-dgii';

function formatMonto(monto: number, moneda: string): string {
  const symbol = moneda === 'USD' ? 'US$' : 'RD$';
  return `${symbol} ${Number(monto).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function labelTipoEcf(tipo: string): string {
  return TIPOS_ECF.find((t) => t.value === tipo)?.label ?? tipo;
}

function labelUnidad(codigo?: number): string {
  if (!codigo) return '';
  return UNIDADES_MEDIDA.find((u) => u.value === codigo)?.label ?? '';
}

export default function ImprimirEcfPage() {
  return (
    <AuthGuard>
      <ImprimirEcfContent />
    </AuthGuard>
  );
}

function ImprimirEcfContent() {
  const params = useParams();
  const id = params.id as string;

  const [ecf, setEcf] = useState<Ecf | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEcf(id)
      .then(setEcf)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Error al cargar comprobante'),
      )
      .finally(() => setLoading(false));
    getEmpresa()
      .then((r) => setLogoBase64(r.empresa.logoBase64 ?? null))
      .catch(() => setLogoBase64(null));
  }, [id]);

  useEffect(() => {
    if (!ecf?.qrUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelado = false;
    QRCode.toDataURL(ecf.qrUrl, { margin: 1, width: 160 })
      .then((url) => {
        if (!cancelado) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setQrDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [ecf?.qrUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !ecf) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error || 'Comprobante no encontrado'}
        </div>
      </div>
    );
  }

  const lineas = ecf.lineas ?? [];

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white py-8 print:py-0">
      {/* Barra de acción — oculta al imprimir */}
      <div className="max-w-3xl mx-auto px-4 mb-4 print:hidden flex justify-end">
        <button
          onClick={() => window.print()}
          className="btn-primary"
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {/* Representación impresa */}
      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none p-8 text-sm text-gray-900">
        {/* Encabezado */}
        <div className="flex justify-between items-start border-b border-gray-300 pb-4 mb-4">
          <div className="flex items-start gap-3">
            {logoBase64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoBase64}
                alt="Logo de la empresa"
                className="h-14 w-auto object-contain"
              />
            )}
            <div>
              <h1 className="text-lg font-bold">{ecf.nombreEmisor}</h1>
              <p className="text-xs text-gray-600">RNC: {ecf.rncEmisor}</p>
              {ecf.direccionEmisor && (
                <p className="text-xs text-gray-600">{ecf.direccionEmisor}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono font-bold text-blue-700">{labelTipoEcf(ecf.tipoEcf)}</p>
            <p className="text-xs text-gray-600">e-NCF: {ecf.encf ?? '—'}</p>
            <p className="text-xs text-gray-600">
              Fecha Emisión: {new Date(ecf.fechaEmision).toLocaleDateString('es-DO')}
            </p>
          </div>
        </div>

        {/* Comprador */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-1">Comprador</h2>
          <p className="font-medium">{ecf.nombreComprador}</p>
          <p className="text-xs text-gray-600">
            RNC/Cédula: {ecf.rncComprador || ecf.idExtranjeroComprador || '—'}
          </p>
          {ecf.direccionComprador && (
            <p className="text-xs text-gray-600">{ecf.direccionComprador}</p>
          )}
          {(ecf.municipioComprador || ecf.provinciaComprador) && (
            <p className="text-xs text-gray-600">
              {[ecf.municipioComprador, ecf.provinciaComprador].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        {/* Líneas */}
        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-1.5">Descripción</th>
              <th className="text-right py-1.5">Cant.</th>
              <th className="text-right py-1.5">Unidad</th>
              <th className="text-right py-1.5">Precio</th>
              <th className="text-right py-1.5">ITBIS</th>
              <th className="text-right py-1.5">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineas.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5">{l.descripcion}</td>
                <td className="text-right py-1.5">{l.cantidad}</td>
                <td className="text-right py-1.5">{labelUnidad(l.unidadMedida)}</td>
                <td className="text-right py-1.5">{formatMonto(l.precioUnitario, ecf.moneda)}</td>
                <td className="text-right py-1.5">{formatMonto(l.itbis, ecf.moneda)}</td>
                <td className="text-right py-1.5 font-medium">
                  {formatMonto(l.subtotal, ecf.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="flex justify-end mb-6">
          <div className="w-56 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>ITBIS</span>
              <span>{formatMonto(ecf.montoITBIS, ecf.moneda)}</span>
            </div>
            {ecf.aplicaPropinaLegal && Number(ecf.montoPropinaLegal) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Propina Legal (10%)</span>
                <span>{formatMonto(ecf.montoPropinaLegal, ecf.moneda)}</span>
              </div>
            )}
            {Number(ecf.montoItbisRetenido) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>ITBIS Retenido</span>
                <span>-{formatMonto(ecf.montoItbisRetenido, ecf.moneda)}</span>
              </div>
            )}
            {Number(ecf.montoRentaRetenido) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>ISR Retenido</span>
                <span>-{formatMonto(ecf.montoRentaRetenido, ecf.moneda)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 mt-1">
              <span>Total</span>
              <span>{formatMonto(ecf.montoTotal, ecf.moneda)}</span>
            </div>
          </div>
        </div>

        {/* QR + código de seguridad */}
        {ecf.codigoSeguridadDgii && (
          <div className="flex items-center gap-4 border-t border-gray-300 pt-4">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Código QR" width={100} height={100} />
            )}
            <div className="text-xs text-gray-600">
              <p>
                Código de seguridad:{' '}
                <span className="font-mono font-bold text-gray-900">
                  {ecf.codigoSeguridadDgii}
                </span>
              </p>
              {ecf.uuid && <p>UUID DGII: {ecf.uuid}</p>}
              <p className="mt-1">
                Este documento es una representación impresa de un e-CF. Puede verificarlo
                escaneando el código QR.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
