import { Test, TestingModule } from '@nestjs/testing';
import { RncLookupController } from './rnc-lookup.controller';
import { RncLookupService } from './rnc-lookup.service';

describe('RncLookupController', () => {
  let controller: RncLookupController;
  let mockService: any;

  beforeEach(async () => {
    mockService = {
      buscarPorRnc: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RncLookupController],
      providers: [{ provide: RncLookupService, useValue: mockService }],
    }).compile();

    controller = module.get(RncLookupController);
  });

  it('delega en el servicio con el RNC de la ruta', async () => {
    mockService.buscarPorRnc.mockResolvedValue({ found: true, rnc: '132943058', razonSocial: 'STP' });

    const resultado = await controller.buscarPorRnc('132943058');

    expect(mockService.buscarPorRnc).toHaveBeenCalledWith('132943058');
    expect(resultado).toEqual({ found: true, rnc: '132943058', razonSocial: 'STP' });
  });
});
