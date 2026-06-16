import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AdminGuard } from '../common/guards/admin.guard';

@Module({
  controllers: [ApiKeysController],
  providers:   [ApiKeysService, AdminGuard],
  exports:     [ApiKeysService],
})
export class ApiKeysModule {}
