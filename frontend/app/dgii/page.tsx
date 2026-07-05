'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { authenticateDgii } from '@/lib/api';

export default function DgiiPage() {
  return (
    <AuthGuard>
      <DgiiContent />
    </AuthGuard>
  );
}

function DgiiContent() {
  const [rncEmisor, setRncEmisor] = useState('');
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState<{ expiresIn: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setExito(null);
    setLoading(true);
    try {
      const result = await authenticateDgii(rncEmisor.trim(), usuario.trim(), clave);
      setExito({ expiresIn: result.expiresIn });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al autenticar con la DGII');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Conexión con la DGII</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Autentícate con tus credenciales de la Oficina Virtual para poder transmitir
            comprobantes firmados.
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {exito && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Conectado con la DGII. El token quedó guardado para toda tu empresa (expira
                en {Math.round(exito.expiresIn / 60)} minutos).
              </div>
            )}

            <div>
              <label className="label">RNC Emisor *</label>
              <input
                type="text"
                required
                value={rncEmisor}
                onChange={(e) => setRncEmisor(e.target.value)}
                placeholder="101-12345-6"
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Usuario Oficina Virtual *</label>
              <input
                type="text"
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Clave *</label>
              <input
                type="password"
                required
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="input-field"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Conectando…
                </span>
              ) : (
                'Conectar con la DGII'
              )}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          En desarrollo esta conexión usa un token de prueba (mock) — no se envían datos reales
          a la DGII hasta contar con certificado y credenciales del ambiente TesteCF.
        </p>
      </main>
    </div>
  );
}
