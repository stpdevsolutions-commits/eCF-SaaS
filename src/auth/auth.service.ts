import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Verificar si usuario existe
    const userExists = await this.userRepository.findOne({
      where: [{ email: dto.email }, { numeroRegistro: dto.numeroRegistro }],
    });

    if (userExists) {
      throw new ConflictException('Usuario o número de registro ya existe');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Crear usuario
    const user = this.userRepository.create({
      nombre: dto.nombre,
      email: dto.email,
      password: hashedPassword,
      numeroRegistro: dto.numeroRegistro,
      tipoPersona: dto.tipoPersona || 'juridica',
      tipoContribuyente: dto.tipoContribuyente || 'regimen_ordinario',
      razonSocial: dto.razonSocial,
      direccion: dto.direccion,
      telefono: dto.telefono,
    });

    await this.userRepository.save(user);

    return this.generateToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Comparar passwords
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    return this.generateToken(user);
  }

  async validateUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario no válido');
    }
    return user;
  }

  private generateToken(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      numeroRegistro: user.numeroRegistro,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        numeroRegistro: user.numeroRegistro,
      },
    };
  }
}
