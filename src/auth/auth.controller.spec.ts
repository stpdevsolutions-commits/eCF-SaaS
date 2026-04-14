import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const dto: RegisterDto = {
        nombre: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        numeroRegistro: '12345678901',
        tipoPersona: 'juridica',
      };

      const expectedResult = {
        access_token: 'token',
        user: {
          id: '1',
          email: 'test@example.com',
          nombre: 'Test User',
          numeroRegistro: '12345678901',
        },
      };

      jest.spyOn(service, 'register').mockResolvedValue(expectedResult);

      const result = await controller.register(dto);

      expect(result).toEqual(expectedResult);
      expect(service.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should login user', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        access_token: 'token',
        user: {
          id: '1',
          email: 'test@example.com',
          nombre: 'Test User',
          numeroRegistro: '12345678901',
        },
      };

      jest.spyOn(service, 'login').mockResolvedValue(expectedResult);

      const result = await controller.login(dto);

      expect(result).toEqual(expectedResult);
      expect(service.login).toHaveBeenCalledWith(dto);
    });
  });
});
