import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RncLookupService, RncLookupResult } from './rnc-lookup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Consulta RNC (DGII)')
@Controller('rnc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RncLookupController {
  constructor(private rncLookupService: RncLookupService) {}

  @Get(':rnc')
  // Cada consulta hace un scraping en vivo contra la DGII (2 requests) — un
  // límite propio evita golpear su portal si alguien deja el autocompletado
  // pegado al teclado.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Busca razón social y datos del contribuyente en el padrón público de la DGII por RNC/Cédula',
  })
  async buscarPorRnc(@Param('rnc') rnc: string): Promise<RncLookupResult> {
    return this.rncLookupService.buscarPorRnc(rnc);
  }
}
