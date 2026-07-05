import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DgiiCertificateService } from './dgii-certificate.service';

const mockGetKeyFromStringBase64 = jest.fn();

jest.mock('dgii-ecf', () => ({
  __esModule: true,
  P12Reader: jest.fn().mockImplementation(() => ({
    getKeyFromStringBase64: (...args: any[]) => mockGetKeyFromStringBase64(...args),
  })),
}));

describe('DgiiCertificateService', () => {
  async function build(envValues: Record<string, string | undefined>) {
    const mockConfigService = {
      get: jest.fn((key: string) => envValues[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DgiiCertificateService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    return module.get<DgiiCertificateService>(DgiiCertificateService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sin DGII_CERT_P12_BASE64/PASSPHRASE, genera un certificado de desarrollo autofirmado', async () => {
    const service = await build({});

    const usaReal = await service.usaCertificadoReal();
    const pem = await service.getCertificatePem();

    expect(usaReal).toBe(false);
    expect(pem).toContain('BEGIN CERTIFICATE');
    expect(mockGetKeyFromStringBase64).not.toHaveBeenCalled();
  }, 15000);

  it('con DGII_CERT_P12_BASE64 y PASSPHRASE válidos, usa el certificado real', async () => {
    mockGetKeyFromStringBase64.mockReturnValue({
      key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
      cert: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
    });
    const service = await build({
      DGII_CERT_P12_BASE64: 'ZmFrZS1iYXNlNjQ=',
      DGII_CERT_PASSPHRASE: 'clave-segura',
    });

    const usaReal = await service.usaCertificadoReal();
    const { key, cert } = await service.getP12ReaderData();

    expect(usaReal).toBe(true);
    expect(key).toContain('BEGIN PRIVATE KEY');
    expect(cert).toContain('BEGIN CERTIFICATE');
  });

  it('con P12_BASE64 configurado pero sin poder extraer clave/certificado, lanza un error', async () => {
    mockGetKeyFromStringBase64.mockReturnValue({ key: undefined, cert: undefined });
    const service = await build({
      DGII_CERT_P12_BASE64: 'ZmFrZS1iYXNlNjQ=',
      DGII_CERT_PASSPHRASE: 'clave-incorrecta',
    });

    await expect(service.getCertificatePem()).rejects.toThrow(
      /no se pudo extraer clave privada\/certificado/,
    );
  });

  it('memoiza el certificado: solo lo resuelve una vez por instancia', async () => {
    const service = await build({});

    const [pem1, pem2] = await Promise.all([
      service.getCertificatePem(),
      service.getCertificatePem(),
    ]);

    expect(pem1).toBe(pem2);
  }, 15000);
});
