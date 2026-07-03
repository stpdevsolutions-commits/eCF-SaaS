import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DgiiService } from './dgii.service';
import { DgiiController } from './dgii.controller';
import { Ecf } from '../ecf/entities/ecf.entity';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ecf, User])],
  controllers: [DgiiController],
  providers: [DgiiService],
  exports: [DgiiService],
})
export class DgiiModule {}
