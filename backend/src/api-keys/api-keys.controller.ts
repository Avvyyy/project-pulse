import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('admin/api-keys')
@UseGuards(AdminGuard)
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApiKeyDto) {
    const { apiKey, fullKey } = await this.service.create(dto);
    return {
      id:         apiKey.id,
      name:       apiKey.name,
      key_prefix: apiKey.keyPrefix,
      full_key:   fullKey, // shown exactly once — store it securely
      rate_limit: apiKey.rateLimit,
      created_at: apiKey.createdAt,
    };
  }

  @Get()
  async list() {
    const keys = await this.service.findAll();
    return keys.map((k) => ({
      id:           k.id,
      name:         k.name,
      key_prefix:   k.keyPrefix,
      rate_limit:   k.rateLimit,
      is_active:    k.isActive,
      created_at:   k.createdAt,
      revoked_at:   k.revokedAt,
      last_used_at: k.lastUsedAt,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.revoke(id);
  }
}
