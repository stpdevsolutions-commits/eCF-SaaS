import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Tests e2e básicos.
 *
 * Requisitos:
 *  - PostgreSQL corriendo (docker-compose up -d) en el puerto definido en .env (5433).
 *  - Dependencias de dev: supertest y @types/supertest.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mismo pipeline que src/main.ts
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde 200 con estado de la API', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/version responde 200', async () => {
    await request(app.getHttpServer()).get('/api/version').expect(200);
  });

  it('GET /api/ecf sin token responde 401 (endpoint protegido)', async () => {
    await request(app.getHttpServer()).get('/api/ecf').expect(401);
  });

  it('GET /api/auth/me sin token responde 401 (endpoint protegido)', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});
