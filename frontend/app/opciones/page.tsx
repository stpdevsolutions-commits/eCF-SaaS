'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import {
  changePassword,
  createUsuarioEmpresa,
  deactivateUsuarioEmpresa,
  getEmpresa,
  getMe,
  getSecuencias,
  getStoredUser,
  saveStoredUser,
  setSecuencia,
  updateEmpresa,
  updatePerfil,
} from '@/lib/api';
import {
  Empresa,
  SecuenciaEncf,
  SessionUser,
  UsuarioEmpresa,
} from '@/lib/types';

export default function OpcionesPage() {
  return (
    <AuthGuard>
      <OpcionesContent />
    </AuthGuard>
  );
}

// ── Mensajes de feedback reutilizables ───────────────────────────────────────

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      {children}
    </div>
  );
}

function SuccessMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
      {children}
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ── Página ───────────────────────────────────────────────────────────────────

function OpcionesContent() {
  const [usuario, setUsuario] = useState<SessionUser | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.rol) {
      setUsuario(stored);
      setCargando(false);
      return;
    }
    // Sesión antigua sin usuario guardado: pedirlo al backend
    getMe()
      .then((me) => {
        const user: SessionUser = {
          id: me.id,
          email: me.email,
          nombre: me.nombre,
          rol: me.rol,
          empresaId: me.empresaId,
        };
        saveStoredUser(user);
        setUsuario(user);
      })
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-sm text-gray-500">Cargando…</p>
        </main>
      </div>
    );
  }

  const isAdmin = usuario?.rol === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configuración de tu cuenta{isAdmin ? ', tu empresa, secuencias y equipo' : ' y consulta de secuencias eNCF'}.
          </p>
        </div>

        <MiCuentaSection
          usuario={usuario}
          onNombreActualizado={(nombre) => {
            if (usuario) {
              const actualizado = { ...usuario, nombre };
              saveStoredUser(actualizado);
              setUsuario(actualizado);
            }
          }}
        />

        {isAdmin && <EmpresaYUsuariosSections currentUserId={usuario?.id} />}

        <SecuenciasSection isAdmin={isAdmin} />
      </main>
    </div>
  );
}

// ── Mi cuenta ────────────────────────────────────────────────────────────────

function MiCuentaSection({
  usuario,
  onNombreActualizado,
}: {
  usuario: SessionUser | null;
  onNombreActualizado: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [nombreMsg, setNombreMsg] = useState('');
  const [nombreError, setNombreError] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);

  async function handleNombre(e: React.FormEvent) {
    e.preventDefault();
    setNombreMsg('');
    setNombreError('');
    setGuardandoNombre(true);
    try {
      const result = await updatePerfil(nombre.trim());
      setNombreMsg(result.message ?? 'Nombre actualizado');
      onNombreActualizado(nombre.trim());
    } catch (err: unknown) {
      setNombreError(errMsg(err, 'Error al actualizar el nombre'));
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg('');
    setPassError('');

    if (passwordNueva.length < 8) {
      setPassError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (passwordNueva !== passwordConfirm) {
      setPassError('Las contraseñas no coinciden');
      return;
    }

    setGuardandoPass(true);
    try {
      const result = await changePassword(passwordActual, passwordNueva);
      setPassMsg(result.message ?? 'Contraseña actualizada');
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordConfirm('');
    } catch (err: unknown) {
      setPassError(errMsg(err, 'Error al cambiar la contraseña'));
    } finally {
      setGuardandoPass(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Mi cuenta</h2>
      <p className="text-sm text-gray-500 mb-4">{usuario?.email}</p>

      <form onSubmit={handleNombre} className="space-y-3 max-w-md">
        {nombreError && <ErrorMsg>{nombreError}</ErrorMsg>}
        {nombreMsg && <SuccessMsg>{nombreMsg}</SuccessMsg>}
        <div>
          <label htmlFor="nombre" className="label">
            Nombre
          </label>
          <input
            id="nombre"
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input-field"
          />
        </div>
        <button type="submit" disabled={guardandoNombre} className="btn-secondary">
          {guardandoNombre ? 'Guardando…' : 'Guardar nombre'}
        </button>
      </form>

      <hr className="my-6 border-gray-200" />

      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Cambiar contraseña
      </h3>
      <form onSubmit={handlePassword} className="space-y-3 max-w-md">
        {passError && <ErrorMsg>{passError}</ErrorMsg>}
        {passMsg && <SuccessMsg>{passMsg}</SuccessMsg>}
        <div>
          <label htmlFor="password-actual" className="label">
            Contraseña actual
          </label>
          <input
            id="password-actual"
            type="password"
            required
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="password-nueva" className="label">
            Nueva contraseña
          </label>
          <input
            id="password-nueva"
            type="password"
            required
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="password-confirm" className="label">
            Confirmar nueva contraseña
          </label>
          <input
            id="password-confirm"
            type="password"
            required
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="input-field"
          />
        </div>
        <button type="submit" disabled={guardandoPass} className="btn-primary">
          {guardandoPass ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </section>
  );
}

// ── Empresa + Usuarios (solo admin) ─────────────────────────────────────────

function EmpresaYUsuariosSections({ currentUserId }: { currentUserId?: string }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    getEmpresa()
      .then((data) => {
        setEmpresa(data.empresa);
        setUsuarios(data.usuarios);
        setError('');
      })
      .catch((err: unknown) =>
        setError(errMsg(err, 'Error al cargar la empresa')),
      );
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Empresa</h2>
        <ErrorMsg>{error}</ErrorMsg>
      </section>
    );
  }

  if (!empresa) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Empresa</h2>
        <p className="text-sm text-gray-500">Cargando empresa…</p>
      </section>
    );
  }

  return (
    <>
      <EmpresaSection empresa={empresa} onActualizada={setEmpresa} />
      <UsuariosSection
        usuarios={usuarios}
        currentUserId={currentUserId}
        onCambio={cargar}
      />
    </>
  );
}

function EmpresaSection({
  empresa,
  onActualizada,
}: {
  empresa: Empresa;
  onActualizada: (e: Empresa) => void;
}) {
  const [razonSocial, setRazonSocial] = useState(empresa.razonSocial ?? '');
  const [nombreComercial, setNombreComercial] = useState(
    empresa.nombreComercial ?? '',
  );
  const [direccion, setDireccion] = useState(empresa.direccion ?? '');
  const [telefono, setTelefono] = useState(empresa.telefono ?? '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');
    setGuardando(true);
    try {
      const actualizada = await updateEmpresa({
        razonSocial: razonSocial.trim(),
        nombreComercial: nombreComercial.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
      });
      onActualizada(actualizada);
      setMsg('Datos de la empresa actualizados');
    } catch (err: unknown) {
      setError(errMsg(err, 'Error al actualizar la empresa'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Empresa</h2>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        {error && <ErrorMsg>{error}</ErrorMsg>}
        {msg && <SuccessMsg>{msg}</SuccessMsg>}

        <div>
          <label className="label">RNC</label>
          <input
            type="text"
            value={empresa.rnc}
            disabled
            readOnly
            className="input-field bg-gray-100 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">
            El RNC no es editable (identidad fiscal del emisor).
          </p>
        </div>
        <div>
          <label htmlFor="razon-social" className="label">
            Razón social
          </label>
          <input
            id="razon-social"
            type="text"
            required
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="nombre-comercial" className="label">
            Nombre comercial
          </label>
          <input
            id="nombre-comercial"
            type="text"
            value={nombreComercial}
            onChange={(e) => setNombreComercial(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="direccion" className="label">
            Dirección
          </label>
          <input
            id="direccion"
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="telefono" className="label">
            Teléfono
          </label>
          <input
            id="telefono"
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="input-field"
          />
        </div>

        <button type="submit" disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar empresa'}
        </button>
      </form>
    </section>
  );
}

// ── Usuarios del equipo (solo admin) ─────────────────────────────────────────

function UsuariosSection({
  usuarios,
  currentUserId,
  onCambio,
}: {
  usuarios: UsuarioEmpresa[];
  currentUserId?: string;
  onCambio: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setCreando(true);
    try {
      await createUsuarioEmpresa({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
      });
      setMsg('Usuario creado exitosamente');
      setNombre('');
      setEmail('');
      setPassword('');
      onCambio();
    } catch (err: unknown) {
      setError(errMsg(err, 'Error al crear el usuario'));
    } finally {
      setCreando(false);
    }
  }

  async function handleDesactivar(u: UsuarioEmpresa) {
    if (
      !window.confirm(
        `¿Desactivar a ${u.nombre} (${u.email})? No podrá iniciar sesión.`,
      )
    ) {
      return;
    }
    setMsg('');
    setError('');
    try {
      await deactivateUsuarioEmpresa(u.id);
      setMsg('Usuario desactivado exitosamente');
      onCambio();
    } catch (err: unknown) {
      setError(errMsg(err, 'Error al desactivar el usuario'));
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Usuarios del equipo
      </h2>

      {error && <div className="mb-3"><ErrorMsg>{error}</ErrorMsg></div>}
      {msg && <div className="mb-3"><SuccessMsg>{msg}</SuccessMsg></div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4 font-medium">Nombre</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Rol</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 text-gray-900">{u.nombre}</td>
                <td className="py-2 pr-4 text-gray-600">{u.email}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.rol === 'admin'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {u.rol}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.activo
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {u.activo && u.id !== currentUserId && (
                    <button
                      onClick={() => handleDesactivar(u)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      Desactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="my-6 border-gray-200" />

      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Crear usuario (rol member)
      </h3>
      <form onSubmit={handleCrear} className="space-y-3 max-w-md">
        <div>
          <label htmlFor="nuevo-nombre" className="label">
            Nombre del usuario
          </label>
          <input
            id="nuevo-nombre"
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="nuevo-email" className="label">
            Email del usuario
          </label>
          <input
            id="nuevo-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="nuevo-password" className="label">
            Contraseña del usuario
          </label>
          <input
            id="nuevo-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </div>
        <button type="submit" disabled={creando} className="btn-primary">
          {creando ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>
    </section>
  );
}

// ── Secuencias eNCF ──────────────────────────────────────────────────────────

function SecuenciasSection({ isAdmin }: { isAdmin: boolean }) {
  const [secuencias, setSecuencias] = useState<SecuenciaEncf[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardandoTipo, setGuardandoTipo] = useState<string | null>(null);

  useEffect(() => {
    getSecuencias()
      .then((data) => {
        setSecuencias(data);
        setValores(
          Object.fromEntries(
            data.map((s) => [s.tipoEcf, String(s.ultimaSecuencia)]),
          ),
        );
      })
      .catch((err: unknown) =>
        setError(errMsg(err, 'Error al cargar las secuencias')),
      )
      .finally(() => setCargando(false));
  }, []);

  async function handleFijar(sec: SecuenciaEncf) {
    setMsg('');
    setError('');

    const nuevo = Number(valores[sec.tipoEcf]);
    if (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > 9_999_999_999) {
      setError('La secuencia debe ser un entero entre 0 y 9999999999');
      return;
    }
    if (nuevo < sec.ultimaSecuencia) {
      setError(
        'La secuencia no puede bajarse: se re-emitirían eNCF ya utilizados',
      );
      return;
    }
    if (
      !window.confirm(
        `¿Fijar la secuencia de ${sec.tipoEcf} en ${nuevo}? ` +
          'Una vez subida, la secuencia NO puede bajarse.',
      )
    ) {
      return;
    }

    setGuardandoTipo(sec.tipoEcf);
    try {
      const actualizada = await setSecuencia(sec.tipoEcf, nuevo);
      setSecuencias((prev) =>
        prev.map((s) => (s.tipoEcf === sec.tipoEcf ? actualizada : s)),
      );
      setValores((prev) => ({
        ...prev,
        [sec.tipoEcf]: String(actualizada.ultimaSecuencia),
      }));
      setMsg(`Secuencia de ${sec.tipoEcf} actualizada`);
    } catch (err: unknown) {
      setError(errMsg(err, 'Error al fijar la secuencia'));
    } finally {
      setGuardandoTipo(null);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Secuencias eNCF
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Última secuencia asignada por tipo de e-CF y próximo eNCF a emitir.
        {isAdmin &&
          ' Puedes fijar el contador (p. ej. la secuencia autorizada por la DGII), pero nunca bajarlo.'}
      </p>

      {error && <div className="mb-3"><ErrorMsg>{error}</ErrorMsg></div>}
      {msg && <div className="mb-3"><SuccessMsg>{msg}</SuccessMsg></div>}

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando secuencias…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Tipo de e-CF</th>
                <th className="py-2 pr-4 font-medium">Última secuencia</th>
                <th className="py-2 pr-4 font-medium">Próximo eNCF</th>
                {isAdmin && <th className="py-2 font-medium">Fijar secuencia</th>}
              </tr>
            </thead>
            <tbody>
              {secuencias.map((sec) => (
                <tr key={sec.tipoEcf} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-900 font-mono text-xs">
                    {sec.tipoEcf}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {sec.ultimaSecuencia}
                  </td>
                  <td className="py-2 pr-4 text-gray-900 font-mono">
                    {sec.proximoEncf}
                  </td>
                  {isAdmin && (
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={9999999999}
                          aria-label={`Nueva secuencia ${sec.tipoEcf}`}
                          value={valores[sec.tipoEcf] ?? ''}
                          onChange={(e) =>
                            setValores((prev) => ({
                              ...prev,
                              [sec.tipoEcf]: e.target.value,
                            }))
                          }
                          className="input-field w-36 py-1"
                        />
                        <button
                          onClick={() => handleFijar(sec)}
                          disabled={guardandoTipo === sec.tipoEcf}
                          className="btn-secondary py-1 px-3 text-xs"
                        >
                          {guardandoTipo === sec.tipoEcf ? 'Fijando…' : 'Fijar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
