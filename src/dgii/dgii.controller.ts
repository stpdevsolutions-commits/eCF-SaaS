import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { DgiiService } from './dgii.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Integración DGII')
@Controller('api/dgii')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DgiiController {
  constructor(private dgiiService: DgiiService) {}

  @Post('authenticate')
  @ApiOperation({ summary: 'Autenticar con DGII' })
  async authenticate(
    @Body() body: { rncEmisor: string; usuario: string; clave: string },
  ) {
    return await this.dgiiService.authenticate(
      body.rncEmisor,
      body.usuario,
      body.clave,
    );
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
