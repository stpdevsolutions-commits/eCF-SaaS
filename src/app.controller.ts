import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}

  @Get('/health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return this.appService.getHealth();
  }

  @Get('/version')
  @ApiOperation({ summary: 'Versión de API' })
  version() {
    return this.appService.getVersion();
  }
}
