import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DgiiService } from './dgii.service';
import { User } from '../auth/entities/user.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Integración DGII')
@Controller('dgii')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DgiiController {
  constructor(
    private dgiiService: DgiiService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  @Post('authenticate')
  @ApiOperation({ summary: 'Autenticar con DGII y guardar el token en la cuenta' })
  async authenticate(
    @Body() body: { rncEmisor: string; usuario: string; clave: string },
    @Request() req: any,
  ) {
    const resultado = await this.dgiiService.authenticate(
      body.rncEmisor,
      body.usuario,
      body.clave,
    );

    await this.userRepository.update(req.user.id, {
      tokenDgii: resultado.token,
      certificadoDgii: true,
    });

    return resultado;
  }

  @Get('status/:uuid')
  @ApiOperation({ summary: 'Consultar estado en DGII' })
  async getStatus(
    @Param('uuid') uuid: string,
    @Body() body: { token: string },
  ) {
    return await this.dgiiService.queryEcfStatus(uuid, body.token);
  }

  @Post('cancel/:uuid')
  @ApiOperation({ summary: 'Cancelar comprobante en DGII' })
  async cancel(
    @Param('uuid') uuid: string,
    @Body() body: { motivo: string; token: string },
  ) {
    return await this.dgiiService.cancelEcf(uuid, body.motivo, body.token);
  }
}
