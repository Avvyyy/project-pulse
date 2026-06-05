import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { DashboardService } from './dashboard.service';

class DashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['24h', '7d', '30d'])
  period?: '24h' | '7d' | '30d';
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  get(@Query() query: DashboardQueryDto) {
    return this.service.getDashboard(query.period ?? '24h');
  }
}
