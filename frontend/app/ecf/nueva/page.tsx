'use client';

import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import EcfForm from '@/components/EcfForm';

export default function NuevaEcfPage() {
  return (
    <AuthGuard>
      <NuevaEcfContent />
    </AuthGuard>
  );
}

function NuevaEcfContent() {
  const router = useRouter();

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
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Comprobante Fiscal</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Los datos del emisor se toman de tu empresa (Opciones → Empresa).
          </p>
        </div>

        <EcfForm modo="crear" />
      </main>
    </div>
  );
}
