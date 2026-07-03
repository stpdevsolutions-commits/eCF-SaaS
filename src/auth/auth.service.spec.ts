import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Empresa } from '../empresa/entities/empresa.entity';

describe('AuthService (perfil y contraseña)', () => {
  let service: AuthService;
  let mockUserRepository: any;

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn((u: any) => Promise.resolve(u)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'token') } },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Empresa), useValue: { findOne: jest.fn() } },
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('changePassword', () => {
    it('actualiza el hash cuando la contraseña actual es correcta', async () => {
      const hashActual = await bcrypt.hash('ClaveActual1!', 10);
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        password: hashActual,
      });

      const result = await service.changePassword(
        'u1',
        'ClaveActual1!',
        'ClaveNueva123!',
      );

      expect(result.message).toBe('Contraseña actualizada exitosamente');
      expect(mockUserRepository.save).toHaveBeenCalledTimes(1);

      const saved = mockUserRepository.save.mock.calls[0][0];
      // El password guardado es un hash bcrypt de la nueva contraseña
      expect(saved.password).not.toBe('ClaveNueva123!');
      expect(saved.password).not.toBe(hashActual);
      expect(await bcrypt.compare('ClaveNueva123!', saved.password)).toBe(true);
    });

    it('lanza Unauthorized si la contraseña actual no coincide', async () => {
      const hashActual = await bcrypt.hash('ClaveActual1!', 10);
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        password: hashActual,
      });

      await expect(
        service.changePassword('u1', 'Incorrecta!', 'ClaveNueva123!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el usuario no existe', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword('nope', 'a', 'ClaveNueva123!'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePerfil', () => {
    it('actualiza el nombre y devuelve el usuario sin password', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        nombre: 'Viejo',
        password: 'hash',
        rol: 'member',
        empresaId: 'e1',
      });

      const result = await service.updatePerfil('u1', 'Nuevo Nombre');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Nuevo Nombre' }),
      );
      expect(result.user.nombre).toBe('Nuevo Nombre');
      expect((result.user as any).password).toBeUndefined();
    });

    it('lanza NotFound si el usuario no existe', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.updatePerfil('nope', 'X')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
