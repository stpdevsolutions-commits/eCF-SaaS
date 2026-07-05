import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DgiiService } from './dgii.service';
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
}
