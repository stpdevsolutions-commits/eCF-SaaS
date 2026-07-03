import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /**
   * Registra la Empresa (fuente de verdad fiscal: RNC, razón social, ...) y
   * su primer usuario con rol 'admin', en una transacción.
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const existingEmpresa = await this.empresaRepository.findOne({
      where: { rnc: dto.numeroRegistro },
    });

    if (existingEmpresa) {
      throw new ConflictException('El RNC ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const { savedUser, savedEmpresa } = await this.dataSource.transaction(
      async (manager) => {
        const empresa = manager.create(Empresa, {
          rnc: dto.numeroRegistro,
          razonSocial: dto.razonSocial || dto.nombre,
          direccion: dto.direccion,
          telefono: dto.telefono,
          tipoContribuyente: dto.tipoContribuyente || 'regimen_ordinario',
        });
        const savedEmpresa = await manager.save(empresa);

        const user = manager.create(User, {
          ...dto,
          password: hashedPassword,
          empresaId: savedEmpresa.id,
          rol: 'admin',
        });
        const savedUser = await manager.save(user);

        return { savedUser, savedEmpresa };
      },
    );

    return this.buildAuthResponse(savedUser, savedEmpresa);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const empresa = user.empresaId
      ? await this.empresaRepository.findOne({ where: { id: user.empresaId } })
      : null;

    return this.buildAuthResponse(user, empresa);
  }

  private buildAuthResponse(user: User, empresa: Empresa | null) {
    const payload = {
      sub: user.id,
      email: user.email,
      numeroRegistro: user.numeroRegistro,
      empresaId: user.empresaId ?? empresa?.id ?? null,
      rol: user.rol,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        numeroRegistro: user.numeroRegistro,
        rol: user.rol,
        empresaId: user.empresaId ?? empresa?.id ?? null,
      },
      empresa: empresa
        ? {
            id: empresa.id,
            rnc: empresa.rnc,
            razonSocial: empresa.razonSocial,
          }
        : null,
    };
  }

  /**
   * Cambia la contraseña del propio usuario. Requiere la contraseña actual
   * (verificada con bcrypt) para evitar cambios con un token robado.
   */
  async changePassword(
    userId: string,
    passwordActual: string,
    passwordNueva: string,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isPasswordValid = await bcrypt.compare(passwordActual, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    user.password = await bcrypt.hash(passwordNueva, 10);
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  /** Actualiza el nombre del propio usuario. */
  async updatePerfil(userId: string, nombre: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.nombre = nombre;
    const saved = await this.userRepository.save(user);

    return {
      message: 'Perfil actualizado exitosamente',
      user: {
        id: saved.id,
        email: saved.email,
        nombre: saved.nombre,
        rol: saved.rol,
        empresaId: saved.empresaId ?? null,
      },
    };
  }

  /**
   * Usado por JwtStrategy: carga el usuario fresco desde la BD, por lo que
   * `empresaId` y `rol` siempre están disponibles aunque el token sea viejo
   * (emitido antes del modelo multi-empresa). Usuarios desactivados quedan
   * rechazados.
   */
  async validateUser(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user || !user.activo) {
      return null;
    }

    return user;
  }
}
