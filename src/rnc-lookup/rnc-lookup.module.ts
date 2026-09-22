import { Module } from '@nestjs/common';
import { RncLookupService } from './rnc-lookup.service';
import { RncLookupController } from './rnc-lookup.controller';

@Module({
  controllers: [RncLookupController],
  providers: [RncLookupService],
  exports: [RncLookupService],
})
export class RncLookupModule {}
