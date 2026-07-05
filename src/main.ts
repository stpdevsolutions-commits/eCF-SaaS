import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // El límite por defecto de Express (100kb) rechaza el logo de la empresa
  // (imagen en base64 dentro del body JSON de PATCH /empresa).
  app.use(json({ limit: '5mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3005')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  app.enableCors({ origin: corsOrigins, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('eCF SaaS API')
    .setDescription('Facturación Electrónica - República Dominicana')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`✅ API en http://localhost:${port}`);
  console.log(`📊 Swagger en http://localhost:${port}/api/docs`);
}

bootstrap().catch(err => { console.error('Error:', err); process.exit(1); });
