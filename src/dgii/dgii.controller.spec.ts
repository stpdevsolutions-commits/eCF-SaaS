import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DgiiController } from './dgii.controller';
import { DgiiService } from './dgii.service';
import { Empresa } from '../empresa/entities/empresa.entity';

describe('DgiiController', () => {
  let controller: DgiiController;
  let mockDgiiService: any;
  let mockEmpresaRepository: any;

  beforeEach(async () => {
    mockDgiiService = {
      authenticate: jest.fn(),
    };

    mockEmpresaRepository = {
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DgiiController],
      providers: [
        { provide: DgiiService, useValue: mockDgiiService },
        { provide: getRepositoryToken(Empresa), useValue: mockEmpresaRepository },
      ],
    }).compile();

    controller = module.get<DgiiController>(DgiiController);
  });

  describe('authenticate', () => {
    it('guarda el token DGII en la Empresa del usuario autenticado (no en el usuario)', async () => {
      mockDgiiService.authenticate.mockResolvedValue({ token: 'tok-123', expiresIn: 3600 });
      const req = { user: { id: 'user-id', empresaId: 'empresa-id' } };

      const result = await controller.authenticate(
        { rncEmisor: '101000001', usuario: 'user', clave: 'pass' },
        req,
      );

      expect(mockDgiiService.authenticate).toHaveBeenCalledWith('101000001', 'user', 'pass');
      expect(mockEmpresaRepository.update).toHaveBeenCalledWith('empresa-id', {
        tokenDgii: 'tok-123',
        certificadoDgii: true,
      });
      expect(result).toEqual({ token: 'tok-123', expiresIn: 3600 });
    });
  });
});
