import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EcfModule } from './ecf/ecf.module';
import { ValidationModule } from './validation/validation.module';
import { DgiiModule } from './dgii/dgii.module';
import { User } from './auth/entities/user.entity';
import { Ecf } from './ecf/entities/ecf.entity';
import { LineaEcf } from './ecf/entities/linea-ecf.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        migrations: ['src/database/migrations/*.ts'],
        migrationsRun: false,
      }),
    }),
    AuthModule,
    EcfModule,
    ValidationModule,
    DgiiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
