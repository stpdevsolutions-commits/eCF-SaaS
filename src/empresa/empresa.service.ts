import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Empresa } from './entities/empresa.entity';
import { User } from '../auth/entities/user.entity';
import { CreateEmpresaUserDto } from './dto/create-empresa-user.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';

@Injectable()
export class EmpresaService {
  constructor(
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private toSafeUser(user: User) {
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      activo: user.activo,
      createdAt: user.createdAt,
    };
  }

  /** Datos de la empresa + sus usuarios (sin passwords). */
  async getEmpresa(empresaId: string) {
    const empresa = await this.empresaRepository.findOne({
      where: { id: empresaId },
    });

    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const usuarios = await this.userRepository.find({
      where: { empresaId },
      order: { createdAt: 'ASC' },
    });

    return {
      empresa,
      usuarios: usuarios.map((u) => this.toSafeUser(u)),
    };
  }

  /**
   * Actualiza los datos editables de la empresa. El RNC no es editable
   * (identidad fiscal); solo se aceptan los campos del DTO.
   */
  async updateEmpresa(empresaId: string, dto: UpdateEmpresaDto) {
    const empresa = await this.empresaRepository.findOne({
      where: { id: empresaId },
    });

    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    if (dto.razonSocial !== undefined) empresa.razonSocial = dto.razonSocial;
    if (dto.nombreComercial !== undefined)
      empresa.nombreComercial = dto.nombreComercial;
    if (dto.direccion !== undefined) empresa.direccion = dto.direccion;
    if (dto.telefono !== undefined) empresa.telefono = dto.telefono;

    return await this.empresaRepository.save(empresa);
  }

  /** Crea un usuario 'member' dentro de la empresa. */
  async createUsuario(empresaId: string, dto: CreateEmpresaUserDto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      nombre: dto.nombre,
      email: dto.email,
      password: hashedPassword,
      empresaId,
      rol: 'member',
      activo: true,
    });

    const saved = await this.userRepository.save(user);
    return this.toSafeUser(saved);
  }

  /**
   * Desactiva (no borra) un usuario de la empresa.
   * Un admin no puede desactivarse a sí mismo.
   */
  async deactivateUsuario(
    empresaId: string,
    targetUserId: string,
    requesterId: string,
  ) {
    if (targetUserId === requesterId) {
      throw new BadRequestException('No puedes desactivarte a ti mismo');
    }

    const user = await this.userRepository.findOne({
      where: { id: targetUserId, empresaId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en esta empresa');
    }

    user.activo = false;
    await this.userRepository.save(user);

    return {
      message: 'Usuario desactivado exitosamente',
      usuario: this.toSafeUser(user),
    };
  }
}
