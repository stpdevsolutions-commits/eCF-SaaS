import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EmpresaModule } from './empresa/empresa.module';
import { EcfModule } from './ecf/ecf.module';
import { ValidationModule } from './validation/validation.module';
import { DgiiModule } from './dgii/dgii.module';
import { User } from './auth/entities/user.entity';
import { Ecf } from './ecf/entities/ecf.entity';
import { LineaEcf } from './ecf/entities/linea-ecf.entity';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        APP_PORT: Joi.number().port().default(3000),
        DATABASE_HOST: Joi.string().default('localhost'),
        DATABASE_PORT: Joi.number().port().default(5432),
        DATABASE_USER: Joi.string().default('postgres'),
        DATABASE_PASSWORD: Joi.string().default('postgres'),
        DATABASE_NAME: Joi.string().default('ecf_saas'),
        // Obligatorio (y con longitud mínima) en producción; opcional en dev/test
        // (en dev, si falta, auth usa un fallback con warning en consola)
        JWT_SECRET: Joi.string().when('NODE_ENV', {
          is: 'production',
          then: Joi.string().min(32).required(),
          otherwise: Joi.string().optional(),
        }),
        JWT_EXPIRATION: Joi.string().default('24h'),
        CORS_ORIGIN: Joi.string().default('http://localhost:3005'),
      }),
      validationOptions: {
        allowUnknown: true, // permite otras variables de entorno del sistema
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // 1 minuto
        limit: 100, // 100 req/min por IP (global)
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST') || 'localhost',
        port: parseInt(configService.get('DATABASE_PORT') || '5432'),
        username: configService.get('DATABASE_USER') || 'postgres',
        password: configService.get('DATABASE_PASSWORD') || 'postgres',
        database: configService.get('DATABASE_NAME') || 'ecf_saas',
        entities: [User, Ecf, LineaEcf],
        autoLoadEntities: true,
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        migrations: ['src/database/migrations/*.ts'],
        migrationsRun: false,
      }),
    }),
    AuthModule,
    EmpresaModule,
    EcfModule,
    ValidationModule,
    DgiiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
