import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private startTime = Date.now();

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV,
    };
  }

  getVersion() {
    return { name: process.env.APP_NAME || 'eCF-SaaS', version: '0.0.1' };
  }
}
