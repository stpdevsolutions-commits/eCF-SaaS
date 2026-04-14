import { Module } from '@nestjs/common';
import { XsdValidatorService } from './xsd-validator.service';

@Module({
  providers: [XsdValidatorService],
  exports: [XsdValidatorService],
})
export class ValidationModule {}
