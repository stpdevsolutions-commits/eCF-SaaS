'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import EcfForm from '@/components/EcfForm';
import { getEcf } from '@/lib/api';
import { Ecf } from '@/lib/types';

export default function EditarEcfPage() {
  return (
    <AuthGuard>
      <EditarEcfContent />
    </AuthGuard>
  );
}

function EditarEcfContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ecf, setEcf] = useState<Ecf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEcf(id)
      .then(setEcf)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Error al cargar comprobante'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Editar Comprobante Fiscal</h1>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && ecf && ecf.estado !== 'draft' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            Solo se pueden editar comprobantes en estado Borrador. Este comprobante ya está en
            estado &quot;{ecf.estado}&quot;.
          </div>
        )}

        {!loading && ecf && ecf.estado === 'draft' && (
          <EcfForm modo="editar" ecfExistente={ecf} />
        )}
      </main>
    </div>
  );
}
