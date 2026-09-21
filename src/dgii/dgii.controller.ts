import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DgiiService } from './dgii.service';
import { DgiiReceptorService } from './dgii-receptor.service';
import { Empresa } from '../empresa/entities/empresa.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

// Nota: consultar estado y cancelar un e-CF en la DGII se hace vía
// GET/POST /ecf/:id/status y /ecf/:id/cancel (ecf.controller.ts), que
// resuelven el token DGII de la empresa del usuario autenticado y
// verifican que el e-CF le pertenezca. No se duplica aquí para evitar un
// endpoint sin ese scoping.
@ApiTags('Integración DGII')
@Controller('dgii')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DgiiController {
  constructor(
    private dgiiService: DgiiService,
    private receptorService: DgiiReceptorService,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
  ) {}

  @Post('authenticate')
  @ApiOperation({ summary: 'Autenticar con DGII y guardar el token en la empresa' })
  async authenticate(
    @Body() body: { rncEmisor: string; usuario: string; clave: string },
    @Request() req: any,
  ) {
    const resultado = await this.dgiiService.authenticate(
      body.rncEmisor,
      body.usuario,
      body.clave,
    );

    await this.empresaRepository.update(req.user.empresaId, {
      tokenDgii: resultado.token,
      certificadoDgii: true,
    });

    return resultado;
  }

  @Get('recibidos')
  @ApiOperation({ summary: 'Listar los e-CF recibidos de terceros (rol receptor)' })
  async listarRecibidos() {
    return this.receptorService.listar();
  }

  @Get('recibidos/:id')
  @ApiOperation({ summary: 'Ver el detalle de un e-CF recibido' })
  async obtenerRecibido(@Param('id') id: string) {
    return this.receptorService.obtener(id);
  }

  @Post('recibidos/:id/aprobacion-comercial')
  @ApiOperation({
    summary: 'STP, como comprador, aprueba o rechaza un e-CF recibido y lo notifica a la DGII (ACECF)',
  })
  async emitirAprobacionComercial(
    @Param('id') id: string,
    @Body() body: { estado: 'aceptado' | 'rechazado'; detalleMotivoRechazo?: string },
  ) {
    return this.receptorService.emitirAprobacionComercial(id, body.estado, body.detalleMotivoRechazo);
  }
}
