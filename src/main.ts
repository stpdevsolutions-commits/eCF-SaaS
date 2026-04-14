import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: '*', credentials: true });

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
