import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { ListAlertsDto, ListTriggersDto } from './dto/list-alerts.dto';

const VALID_CONDITION_TYPES = new Set([
  'threshold', 'spike', 'recurrence', 'new_error_group',
]);

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  async list(dto: ListAlertsDto) {
    const where: Prisma.AlertWhereInput = {};
    if (dto.isActive !== undefined) where.isActive = dto.isActive;
    if (dto.service)                where.service  = dto.service;

    const skip = (dto.page ?? 0) * (dto.limit ?? 50);
    const take = dto.limit ?? 50;

    const [total, alerts] = await this.prisma.$transaction([
      this.prisma.alert.count({ where }),
      this.prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          _count: { select: { triggers: true } },
          // Include the most recent trigger to derive firing state client-side
          triggers: {
            orderBy: { triggeredAt: 'desc' },
            take:    1,
          },
        },
      }),
    ]);

    return { total, page: dto.page ?? 0, limit: take, results: alerts };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const alert = await this.prisma.alert.findUnique({
      where:   { id },
      include: {
        _count:   { select: { triggers: true } },
        triggers: { orderBy: { triggeredAt: 'desc' }, take: 1 },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateAlertDto) {
    this.validateCondition(dto.condition);

    const alert = await this.prisma.alert.create({
      data: {
        name:        dto.name,
        description: dto.description,
        service:     dto.service,
        environment: dto.environment,
        level:       dto.level,
        condition:   dto.condition as Prisma.JsonObject,
        isActive:    dto.isActive ?? true,
      },
    });
    this.logger.log(`Alert created: ${alert.id} "${alert.name}"`);
    return alert;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAlertDto) {
    await this.ensureExists(id);
    if (dto.condition) this.validateCondition(dto.condition);

    return this.prisma.alert.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.service     !== undefined && { service:     dto.service }),
        ...(dto.environment !== undefined && { environment: dto.environment }),
        ...(dto.level       !== undefined && { level:       dto.level }),
        ...(dto.condition   !== undefined && { condition:   dto.condition as Prisma.JsonObject }),
        ...(dto.isActive    !== undefined && { isActive:    dto.isActive }),
      },
    });
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggle(id: string) {
    const alert = await this.ensureExists(id);
    return this.prisma.alert.update({
      where: { id },
      data:  { isActive: !alert.isActive },
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.alert.delete({ where: { id } });
  }

  // ─── Trigger history ──────────────────────────────────────────────────────

  async listTriggers(alertId: string, dto: ListTriggersDto) {
    await this.ensureExists(alertId);

    const skip = (dto.page ?? 0) * (dto.limit ?? 50);
    const take = dto.limit ?? 50;

    const [total, results] = await this.prisma.$transaction([
      this.prisma.alertTrigger.count({ where: { alertId } }),
      this.prisma.alertTrigger.findMany({
        where:   { alertId },
        orderBy: { triggeredAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { total, page: dto.page ?? 0, limit: take, results };
  }

  // ─── Resolve trigger ─────────────────────────────────────────────────────

  async resolveTrigger(alertId: string, triggerId: string) {
    await this.ensureExists(alertId);

    const trigger = await this.prisma.alertTrigger.findFirst({
      where: { id: triggerId, alertId },
    });
    if (!trigger)           throw new NotFoundException('Trigger not found');
    if (trigger.resolvedAt) throw new BadRequestException('Trigger already resolved');

    return this.prisma.alertTrigger.update({
      where: { id: triggerId },
      data:  { resolvedAt: new Date() },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private validateCondition(condition: Record<string, unknown>) {
    const type = condition.type as string;
    if (!VALID_CONDITION_TYPES.has(type)) {
      throw new BadRequestException(
        `Invalid condition type "${type}". Must be one of: ${[...VALID_CONDITION_TYPES].join(', ')}`,
      );
    }

    if (type === 'threshold') {
      if (typeof condition.threshold !== 'number' || condition.threshold < 0)
        throw new BadRequestException('threshold.threshold must be a non-negative number');
      if (typeof condition.windowSeconds !== 'number' || condition.windowSeconds < 1)
        throw new BadRequestException('threshold.windowSeconds must be a positive number');
    }

    if (type === 'spike') {
      if (typeof condition.multiplier !== 'number' || condition.multiplier <= 1)
        throw new BadRequestException('spike.multiplier must be a number > 1');
      if (typeof condition.baselineWindowSeconds !== 'number' || condition.baselineWindowSeconds < 60)
        throw new BadRequestException('spike.baselineWindowSeconds must be >= 60');
    }

    if (type === 'recurrence') {
      if (typeof condition.minutes !== 'number' || condition.minutes < 1)
        throw new BadRequestException('recurrence.minutes must be a positive number');
    }
  }

  private async ensureExists(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }
}
