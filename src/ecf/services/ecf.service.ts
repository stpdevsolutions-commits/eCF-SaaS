import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { XsdValidatorService } from '../../validation/xsd-validator.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EcfService {
  constructor(
    @InjectRepository(Ecf)
    private ecfRepository: Repository<Ecf>,
    @InjectRepository(LineaEcf)
    private lineaRepository: Repository<LineaEcf>,
    private validatorService: XsdValidatorService,
  ) {}

  async create(dto: CreateEcfDto, usuarioId: string) {
    // Validar con XSD
    const validation = this.validatorService.validateEcf(dto);

    if (!validation.valid) {
      throw new Error(`Validación fallida: ${validation.errors.join(', ')}`);
    }

    // Calcular montos
    let montoTotal = 0;
    let montoITBIS = 0;

    const lineas = dto.lineas.map((linea, index) => {
      const { subtotal, itbis, total } = this.validatorService.calculateLineTotal(
        linea.cantidad,
        linea.precioUnitario,
        linea.descuentoLinea || 0,
      );

      montoTotal += total;
      montoITBIS += itbis;

      return {
        numero: index + 1,
        ...linea,
        subtotal,
        itbis,
      };
    });

    // Crear comprobante
    const ecf = this.ecfRepository.create({
      tipoEcf: dto.tipoEcf,
      version: 'v1.0',
      fechaEmision: new Date(),
      rncEmisor: dto.rncEmisor,
      nombreEmisor: dto.nombreEmisor,
      rncComprador: dto.rncComprador,
      nombreComprador: dto.nombreComprador,
      montoTotal,
      montoDescuento: 0,
      montoITBIS,
      moneda: dto.moneda || 'RD',
      estado: 'draft',
      usuario: { id: usuarioId } as any,
    });

    const ecfGuardado = await this.ecfRepository.save(ecf);

    // Crear líneas
    for (const linea of lineas) {
      const lineaEntity = this.lineaRepository.create({
        ...linea,
        ecf: ecfGuardado,
      });
      await this.lineaRepository.save(lineaEntity);
    }

    return {
      id: ecfGuardado.id,
      ...ecfGuardado,
      lineas,
    };
  }

  async findAll(usuarioId: string, filters?: { estado?: string; rncComprador?: string }) {
    let query = this.ecfRepository
      .createQueryBuilder('ecf')
      .where('ecf.usuarioId = :usuarioId', { usuarioId })
      .leftJoinAndSelect('ecf.lineas', 'lineas');

    if (filters?.estado) {
      query = query.andWhere('ecf.estado = :estado', { estado: filters.estado });
    }

    if (filters?.rncComprador) {
      query = query.andWhere('ecf.rncComprador = :rncComprador', {
        rncComprador: filters.rncComprador,
      });
    }

    return await query.orderBy('ecf.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, usuarioId: string) {
    const ecf = await this.ecfRepository.findOne({
      where: { id, usuario: { id: usuarioId } },
      relations: ['lineas'],
    });

    if (!ecf) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    return ecf;
  }

  async update(id: string, dto: UpdateEcfDto, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden editar comprobantes en borrador');
    }

    Object.assign(ecf, dto);
    return await this.ecfRepository.save(ecf);
  }

  async remove(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden eliminar comprobantes en borrador');
    }

    await this.lineaRepository.delete({ ecf: { id } });
    await this.ecfRepository.remove(ecf);

    return { message: 'Comprobante eliminado exitosamente' };
  }

  async validateEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    const validation = this.validatorService.validateEcf(ecf);

    ecf.estado = validation.valid ? 'validated' : 'draft';
    await this.ecfRepository.save(ecf);

    return validation;
  }

  async signEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado === 'draft') {
      ecf.estado = 'signed';
      ecf.uuid = uuidv4();
      await this.ecfRepository.save(ecf);
    }

    return {
      id: ecf.id,
      uuid: ecf.uuid,
      estado: ecf.estado,
      mensaje: 'Comprobante firmado (pendiente firma digital real)',
    };
  }
}
