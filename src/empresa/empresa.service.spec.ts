import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { Empresa } from './entities/empresa.entity';
import { User } from '../auth/entities/user.entity';

describe('EmpresaService', () => {
  let service: EmpresaService;
  let mockEmpresaRepository: any;
  let mockUserRepository: any;

  beforeEach(async () => {
    mockEmpresaRepository = {
      findOne: jest.fn(),
    };

    mockUserRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaService,
        { provide: getRepositoryToken(Empresa), useValue: mockEmpresaRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<EmpresaService>(EmpresaService);
  });

  describe('getEmpresa', () => {
    it('devuelve la empresa y sus usuarios sin password', async () => {
      mockEmpresaRepository.findOne.mockResolvedValue({
        id: 'empresa-1',
        rnc: '101234567',
        razonSocial: 'Mi Empresa',
      });
      mockUserRepository.find.mockResolvedValue([
        {
          id: 'u1',
          nombre: 'Admin',
          email: 'admin@e.com',
          password: 'hash',
          rol: 'admin',
          activo: true,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getEmpresa('empresa-1');

      expect(result.empresa.id).toBe('empresa-1');
      expect(result.usuarios).toHaveLength(1);
      expect((result.usuarios[0] as any).password).toBeUndefined();
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { empresaId: 'empresa-1' },
        order: { createdAt: 'ASC' },
      });
    });

    it('lanza NotFound si la empresa no existe', async () => {
      mockEmpresaRepository.findOne.mockResolvedValue(null);

      await expect(service.getEmpresa('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createUsuario', () => {
    it('crea un usuario member de la empresa con password hasheado', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((data: any) => data);
      mockUserRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ id: 'u2', createdAt: new Date(), ...data }),
      );

      const result = await service.createUsuario('empresa-1', {
        nombre: 'María',
        email: 'maria@e.com',
        password: 'Password123!',
      });

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 'empresa-1',
          rol: 'member',
          activo: true,
        }),
      );
      const created = mockUserRepository.create.mock.calls[0][0];
      expect(created.password).not.toBe('Password123!'); // hasheado
      expect((result as any).password).toBeUndefined();
      expect(result.rol).toBe('member');
    });

    it('rechaza email duplicado', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'u1' });

      await expect(
        service.createUsuario('empresa-1', {
          nombre: 'X',
          email: 'dup@e.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivateUsuario', () => {
    it('desactiva (soft delete) un usuario de la empresa', async () => {
      const user = {
        id: 'u2',
        nombre: 'María',
        email: 'maria@e.com',
        rol: 'member',
        activo: true,
        createdAt: new Date(),
      };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockImplementation((data: any) =>
        Promise.resolve(data),
      );

      const result = await service.deactivateUsuario('empresa-1', 'u2', 'u1');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u2', empresaId: 'empresa-1' },
      });
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ activo: false }),
      );
      expect(result.usuario.activo).toBe(false);
    });

    it('impide que un admin se desactive a sí mismo', async () => {
      await expect(
        service.deactivateUsuario('empresa-1', 'u1', 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el usuario es de otra empresa', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivateUsuario('empresa-1', 'u-ajeno', 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
