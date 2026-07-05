/**
 * Tests del detalle de e-CF (/ecf/[id]):
 * - qué botones de acción se muestran según el estado del comprobante
 * - flujo de validar (éxito y validación fallida)
 * - flujo de firmar y transmitir
 * - flujo de cancelación (motivo obligatorio)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EcfDetailPage from '@/app/ecf/[id]/page';
import {
  getEcf,
  validateEcf,
  signEcf,
  transmitEcf,
  checkEcfStatus,
  cancelEcf,
} from '@/lib/api';
import { Ecf } from '@/lib/types';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn() }),
  useParams: () => ({ id: 'ecf-1' }),
  usePathname: () => '/ecf/ecf-1',
}));

jest.mock('@/lib/api', () => ({
  getEcf: jest.fn(),
  validateEcf: jest.fn(),
  signEcf: jest.fn(),
  transmitEcf: jest.fn(),
  checkEcfStatus: jest.fn(),
  cancelEcf: jest.fn(),
}));

const getEcfMock = getEcf as jest.Mock;
const validateEcfMock = validateEcf as jest.Mock;
const signEcfMock = signEcf as jest.Mock;
const transmitEcfMock = transmitEcf as jest.Mock;
const checkEcfStatusMock = checkEcfStatus as jest.Mock;
const cancelEcfMock = cancelEcf as jest.Mock;

const baseEcf: Ecf = {
  id: 'ecf-1',
  tipoEcf: 'e-CF_31_v_1_0',
  version: '1.0',
  fechaEmision: '2026-07-01T10:00:00.000Z',
  rncEmisor: '101123456',
  nombreEmisor: 'Mi Empresa SRL',
  rncComprador: '101987654',
  nombreComprador: 'Cliente SA',
  estado: 'draft',
  montoTotal: 1180,
  montoDescuento: 0,
  montoITBIS: 180,
  montoItbisRetenido: 0,
  montoRentaRetenido: 0,
  tipoPago: 1,
  tipoIngresos: '01',
  aplicaPropinaLegal: false,
  montoPropinaLegal: 0,
  moneda: 'RD',
  lineas: [
    {
      id: 'linea-1',
      numero: 1,
      descripcion: 'Servicio de consultoría',
      indicadorBienoServicio: 2,
      indicadorFacturacion: 1,
      cantidad: 1,
      precioUnitario: 1000,
      descuentoLinea: 0,
      subtotal: 1000,
      itbis: 180,
    },
  ],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
};

function mockEcf(overrides: Partial<Ecf> = {}) {
  getEcfMock.mockResolvedValue({ ...baseEcf, ...overrides });
}

async function renderDetail() {
  render(<EcfDetailPage />);
  // Espera a que cargue el comprobante (aparece el RNC del emisor)
  await screen.findByText('101123456');
}

const btnValidar = () => screen.queryByRole('button', { name: /Validar/ });
const btnFirmar = () => screen.queryByRole('button', { name: /Firmar/ });
const btnTransmitir = () => screen.queryByRole('button', { name: /Transmitir a DGII/ });
const btnConsultar = () => screen.queryByRole('button', { name: /Consultar estado/ });
const btnCancelar = () => screen.queryByRole('button', { name: /✕ Cancelar/ });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
});

describe('EcfDetailPage — acciones según estado', () => {
  it('draft: permite validar y firmar, pero no transmitir/consultar/cancelar', async () => {
    mockEcf({ estado: 'draft' });
    await renderDetail();

    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(btnValidar()).toBeInTheDocument();
    expect(btnFirmar()).toBeInTheDocument();
    expect(btnTransmitir()).not.toBeInTheDocument();
    expect(btnConsultar()).not.toBeInTheDocument();
    expect(btnCancelar()).not.toBeInTheDocument(); // sin uuid no se puede cancelar
  });

  it('validated: sigue permitiendo validar y firmar', async () => {
    mockEcf({ estado: 'validated' });
    await renderDetail();

    expect(screen.getByText('Validado')).toBeInTheDocument();
    expect(btnValidar()).toBeInTheDocument();
    expect(btnFirmar()).toBeInTheDocument();
    expect(btnTransmitir()).not.toBeInTheDocument();
  });

  it('signed: solo permite transmitir', async () => {
    mockEcf({ estado: 'signed' });
    await renderDetail();

    expect(screen.getByText('Firmado')).toBeInTheDocument();
    expect(btnTransmitir()).toBeInTheDocument();
    expect(btnValidar()).not.toBeInTheDocument();
    expect(btnFirmar()).not.toBeInTheDocument();
    expect(btnConsultar()).not.toBeInTheDocument();
  });

  it('transmitted con uuid: permite consultar estado y cancelar', async () => {
    mockEcf({ estado: 'transmitted', uuid: 'uuid-dgii-123' });
    await renderDetail();

    expect(screen.getByText('Transmitido')).toBeInTheDocument();
    expect(btnConsultar()).toBeInTheDocument();
    expect(btnCancelar()).toBeInTheDocument();
    expect(btnTransmitir()).not.toBeInTheDocument();
    expect(btnValidar()).not.toBeInTheDocument();
    expect(btnFirmar()).not.toBeInTheDocument();
  });

  it('accepted con uuid: permite consultar estado y cancelar', async () => {
    mockEcf({ estado: 'accepted', uuid: 'uuid-dgii-123' });
    await renderDetail();

    expect(screen.getByText('Aceptado')).toBeInTheDocument();
    expect(btnConsultar()).toBeInTheDocument();
    expect(btnCancelar()).toBeInTheDocument();
  });

  it('cancelled: no muestra ninguna acción de cancelar ni transmitir', async () => {
    mockEcf({ estado: 'cancelled', uuid: 'uuid-dgii-123' });
    await renderDetail();

    expect(screen.getByText('Anulado')).toBeInTheDocument();
    expect(btnCancelar()).not.toBeInTheDocument();
    expect(btnTransmitir()).not.toBeInTheDocument();
    expect(btnConsultar()).not.toBeInTheDocument();
  });
});

describe('EcfDetailPage — flujo de validación', () => {
  it('validar con éxito muestra el mensaje y recarga el comprobante', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'draft' });
    validateEcfMock.mockResolvedValueOnce({ estado: 'validated', valid: true });
    await renderDetail();

    await user.click(btnValidar()!);

    expect(await screen.findByText('Comprobante validado correctamente.')).toBeInTheDocument();
    expect(validateEcfMock).toHaveBeenCalledWith('ecf-1');
    // getEcf: carga inicial + recarga tras la acción
    expect(getEcfMock).toHaveBeenCalledTimes(2);
  });

  it('validación fallida muestra los errores estructurales', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'draft' });
    validateEcfMock.mockResolvedValueOnce({
      estado: 'draft',
      valid: false,
      errors: ['Falta RNCEmisor', 'Total no cuadra'],
    });
    await renderDetail();

    await user.click(btnValidar()!);

    expect(
      await screen.findByText('Validación fallida: Falta RNCEmisor, Total no cuadra'),
    ).toBeInTheDocument();
  });
});

describe('EcfDetailPage — firmar y transmitir', () => {
  it('firmar llama al API y muestra el mensaje devuelto', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'validated' });
    signEcfMock.mockResolvedValueOnce({ estado: 'signed', mensaje: 'Comprobante firmado con XMLDSig' });
    await renderDetail();

    await user.click(btnFirmar()!);

    expect(await screen.findByText('Comprobante firmado con XMLDSig')).toBeInTheDocument();
    expect(signEcfMock).toHaveBeenCalledWith('ecf-1');
  });

  it('transmitir muestra el UUID y los mensajes de la DGII', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'signed' });
    transmitEcfMock.mockResolvedValueOnce({
      estado: 'transmitted',
      uuid: 'uuid-987',
      codigoSeguridadDgii: 'ABC123',
      mensajes: ['Recibido por DGII'],
    });
    await renderDetail();

    await user.click(btnTransmitir()!);

    expect(
      await screen.findByText(/Transmitido a la DGII\. UUID: uuid-987 — Recibido por DGII/),
    ).toBeInTheDocument();
    expect(transmitEcfMock).toHaveBeenCalledWith('ecf-1');
  });

  it('si transmitir falla se muestra el error del backend', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'signed' });
    transmitEcfMock.mockRejectedValueOnce(new Error('No hay token DGII activo'));
    await renderDetail();

    await user.click(btnTransmitir()!);

    expect(await screen.findByText('No hay token DGII activo')).toBeInTheDocument();
  });

  it('consultar estado muestra el estado reportado por la DGII', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'transmitted', uuid: 'uuid-987' });
    checkEcfStatusMock.mockResolvedValueOnce({
      estado: 'accepted',
      estadoDgii: 'Aceptado',
      mensaje: 'e-CF aceptado por la DGII',
    });
    await renderDetail();

    await user.click(btnConsultar()!);

    expect(
      await screen.findByText(/Estado en la DGII: Aceptado — e-CF aceptado por la DGII/),
    ).toBeInTheDocument();
    expect(checkEcfStatusMock).toHaveBeenCalledWith('ecf-1');
  });
});

describe('EcfDetailPage — cancelación', () => {
  it('exige un motivo antes de confirmar la cancelación', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'transmitted', uuid: 'uuid-987' });
    await renderDetail();

    await user.click(btnCancelar()!);
    expect(screen.getByText('Motivo de la cancelación *')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

    expect(
      await screen.findByText('Debes indicar un motivo de cancelación.'),
    ).toBeInTheDocument();
    expect(cancelEcfMock).not.toHaveBeenCalled();
  });

  it('cancela con motivo y muestra el mensaje de confirmación', async () => {
    const user = userEvent.setup();
    mockEcf({ estado: 'transmitted', uuid: 'uuid-987' });
    cancelEcfMock.mockResolvedValueOnce({ estado: 'cancelled', mensaje: 'Comprobante anulado ante la DGII' });
    await renderDetail();

    await user.click(btnCancelar()!);
    await user.type(
      screen.getByPlaceholderText('Ej: Error en el monto facturado'),
      'Error en el monto facturado del cliente',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));

    expect(await screen.findByText('Comprobante anulado ante la DGII')).toBeInTheDocument();
    expect(cancelEcfMock).toHaveBeenCalledWith('ecf-1', 'Error en el monto facturado del cliente');
    // El formulario de cancelación se cierra tras el éxito
    await waitFor(() => {
      expect(screen.queryByText('Motivo de la cancelación *')).not.toBeInTheDocument();
    });
  });
});

describe('EcfDetailPage — representación impresa', () => {
  it('muestra el código de seguridad cuando el e-CF fue firmado', async () => {
    mockEcf({
      estado: 'signed',
      codigoSeguridadDgii: 'AB12CD',
      qrUrl: 'https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=101123456',
    });
    await renderDetail();

    expect(screen.getByText('Representación Impresa')).toBeInTheDocument();
    expect(screen.getAllByText('AB12CD').length).toBeGreaterThan(0);
  });

  it('no muestra la sección si el e-CF aún no está firmado', async () => {
    mockEcf({ estado: 'draft' });
    await renderDetail();

    expect(screen.queryByText('Representación Impresa')).not.toBeInTheDocument();
  });
});

describe('EcfDetailPage — carga', () => {
  it('muestra el error si el comprobante no se puede cargar', async () => {
    getEcfMock.mockRejectedValueOnce(new Error('Comprobante no encontrado'));

    render(<EcfDetailPage />);

    expect(await screen.findByText('Comprobante no encontrado')).toBeInTheDocument();
    expect(btnValidar()).not.toBeInTheDocument();
  });
});
