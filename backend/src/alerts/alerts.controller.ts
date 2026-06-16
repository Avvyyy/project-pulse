import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { ListAlertsDto, ListTriggersDto } from './dto/list-alerts.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  // ── Read-only (no auth required) ─────────────────────────────────────────

  @Get()
  list(@Query() dto: ListAlertsDto) {
    return this.service.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/triggers')
  listTriggers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ListTriggersDto,
  ) {
    return this.service.listTriggers(id, dto);
  }

  // ── Admin-protected writes ───────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAlertDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/toggle')
  @UseGuards(AdminGuard)
  toggle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggle(id);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/triggers/:triggerId/resolve')
  @UseGuards(AdminGuard)
  resolveTrigger(
    @Param('id',        ParseUUIDPipe) id:        string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
  ) {
    return this.service.resolveTrigger(id, triggerId);
  }
}
