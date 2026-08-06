import { Module } from '@nestjs/common';
import { ServiceTemplatesController } from './service-templates.controller';
import { ServiceTemplatesService } from './service-templates.service';

@Module({
  controllers: [ServiceTemplatesController],
  providers: [ServiceTemplatesService],
})
export class ServiceTemplatesModule {}
