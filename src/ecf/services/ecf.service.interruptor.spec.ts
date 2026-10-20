import { ForbiddenException } from '@nestjs/common';
import { EcfService } from './ecf.service';

/**
 * Interruptor de producción (ECF-12): con DGII_ENVIRONMENT=eCF nada real se emite
 * mientras ECF_EMISION_REAL_HABILITADA no sea "true".
 */
describe('EcfService — interruptor de emisión real', () => {
  function crear(env: Record<string, string | undefined>) {
    const ecfRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: '1', estado: 'draft', tipoEcf: 'e-CF_31_v_1_0', encf: null, uuid: 'u' }),
      save: jest.fn(),
    };
    const ncf: any = { nextSequence: jest.fn().mockResolvedValue(4), getFechaVencimiento: jest.fn().mockResolvedValue('2027-12-31') };
    const dgii: any = { authenticate: jest.fn(), transmitEcf: jest.fn(), cancelEcf: jest.fn() };
    const config: any = { get: jest.fn((k: string) => env[k]) };
    const xml: any = { buildEncf: jest.fn().mockReturnValue('E310000000004'), generateXml: jest.fn().mockReturnValue('<x/>') };
    const validator: any = { validateXmlStructure: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }) };
    const service = new EcfService(ecfRepo, {} as any, {} as any, validator, xml, {} as any, ncf, dgii, config);
    return { service, ncf, dgii };
  }

  it('en producción apagado: validar no consume eNCF', async () => {
    const { service, ncf } = crear({ DGII_ENVIRONMENT: 'eCF' });
    await expect(service.validateEcf('1', 'e')).rejects.toThrow(ForbiddenException);
    expect(ncf.nextSequence).not.toHaveBeenCalled();
  });

  it('en producción apagado: no transmite ni anula', async () => {
    const { service, dgii } = crear({ DGII_ENVIRONMENT: 'eCF', ECF_EMISION_REAL_HABILITADA: 'false' });
    await expect(service.transmitEcf('1', 'e')).rejects.toThrow(ForbiddenException);
    await expect(service.cancelEcf('1', 'e', 'motivo')).rejects.toThrow(ForbiddenException);
    expect(dgii.authenticate).not.toHaveBeenCalled();
    expect(dgii.transmitEcf).not.toHaveBeenCalled();
    expect(dgii.cancelEcf).not.toHaveBeenCalled();
  });

  it('en producción encendido: ya no bloquea (valida y consume eNCF)', async () => {
    const { service, ncf } = crear({ DGII_ENVIRONMENT: 'eCF', ECF_EMISION_REAL_HABILITADA: 'true' });
    await service.validateEcf('1', 'e');
    expect(ncf.nextSequence).toHaveBeenCalled();
  });

  it('en TesteCF no aplica el interruptor', async () => {
    const { service, ncf } = crear({ DGII_ENVIRONMENT: 'TesteCF' });
    await service.validateEcf('1', 'e');
    expect(ncf.nextSequence).toHaveBeenCalled();
  });
});
