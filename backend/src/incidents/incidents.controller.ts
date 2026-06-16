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
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { AddTimelineEntryDto } from './dto/add-timeline-entry.dto';
import { LinkErrorGroupDto } from './dto/link-error-group.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  list(@Query() dto: ListIncidentsDto) {
    return this.service.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/frequency')
  getFrequency(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFrequency(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateIncidentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/timeline')
  @UseGuards(AdminGuard)
  addTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTimelineEntryDto,
  ) {
    return this.service.addTimelineEntry(id, dto);
  }

  @Post(':id/error-groups')
  @UseGuards(AdminGuard)
  linkErrorGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkErrorGroupDto,
  ) {
    return this.service.linkErrorGroup(id, dto);
  }

  @Delete(':id/error-groups/:groupId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkErrorGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.service.unlinkErrorGroup(id, groupId);
  }
}
