import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { AddTimelineEntryDto } from './dto/add-timeline-entry.dto';
import { LinkErrorGroupDto } from './dto/link-error-group.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';

interface FrequencyRow {
  bucket: Date;
  level:  string;
  count:  bigint;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListIncidentsDto) {
    const where: Prisma.IncidentWhereInput = {};
    if (dto.status)   where.status   = dto.status;
    if (dto.severity) where.severity = dto.severity;
    if (dto.service)  where.service  = dto.service;

    const skip  = (dto.page ?? 0) * (dto.limit ?? 20);
    const take  = dto.limit ?? 20;

    const [total, results] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip,
        take,
        include: {
          _count: { select: { errorGroups: true, timeline: true } },
        },
      }),
    ]);

    return { total, page: dto.page ?? 0, limit: take, results };
  }

  async findOne(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where:   { id },
      include: {
        timeline:    { orderBy: { occurredAt: 'asc' } },
        errorGroups: {
          include: { errorGroup: true },
          orderBy: { linkedAt: 'desc' },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async create(dto: CreateIncidentDto) {
    const incident = await this.prisma.incident.create({
      data: {
        title:       dto.title,
        description: dto.description,
        severity:    dto.severity,
        service:     dto.service,
        environment: dto.environment,
        status:      'open',
        timeline: {
          create: {
            type:    'opened',
            message: `Incident opened: ${dto.title}`,
          },
        },
      },
      include: { timeline: true },
    });
    this.logger.log(`Incident created: ${incident.id}`);
    return incident;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Incident not found');

    const timelineData: Prisma.IncidentTimelineCreateManyIncidentInput[] = [];

    if (dto.status && dto.status !== existing.status) {
      timelineData.push({
        type:    'status_change',
        message: `Status changed from ${existing.status} to ${dto.status}`,
        actor:   dto.actor,
      });
    }

    if (dto.severity && dto.severity !== existing.severity) {
      timelineData.push({
        type:    'severity_change',
        message: `Severity changed from ${existing.severity} to ${dto.severity}`,
        actor:   dto.actor,
      });
    }

    const resolvedAt =
      dto.status === 'resolved' && existing.status !== 'resolved'
        ? new Date()
        : existing.resolvedAt ?? undefined;

    return this.prisma.incident.update({
      where: { id },
      data: {
        status:      dto.status      ?? existing.status,
        severity:    dto.severity    ?? existing.severity,
        description: dto.description ?? existing.description ?? undefined,
        resolvedAt,
        timeline: timelineData.length
          ? { createMany: { data: timelineData } }
          : undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Incident not found');
    await this.prisma.incident.delete({ where: { id } });
  }

  async addTimelineEntry(id: string, dto: AddTimelineEntryDto) {
    await this.ensureExists(id);
    return this.prisma.incidentTimeline.create({
      data: {
        incidentId: id,
        type:       'comment',
        message:    dto.message,
        actor:      dto.actor,
      },
    });
  }

  async linkErrorGroup(id: string, dto: LinkErrorGroupDto) {
    await this.ensureExists(id);

    const group = await this.prisma.errorGroup.findUnique({ where: { id: dto.errorGroupId } });
    if (!group) throw new NotFoundException('Error group not found');

    const existing = await this.prisma.incidentErrorGroup.findUnique({
      where: {
        incidentId_errorGroupId: { incidentId: id, errorGroupId: dto.errorGroupId },
      },
    });
    if (existing) throw new BadRequestException('Error group already linked to this incident');

    await this.prisma.$transaction([
      this.prisma.incidentErrorGroup.create({
        data: { incidentId: id, errorGroupId: dto.errorGroupId },
      }),
      this.prisma.incidentTimeline.create({
        data: {
          incidentId: id,
          type:       'error_linked',
          message:    `Linked error group: ${group.title}`,
        },
      }),
    ]);

    return { linked: true, errorGroupId: dto.errorGroupId };
  }

  async unlinkErrorGroup(id: string, errorGroupId: string) {
    await this.ensureExists(id);

    const existing = await this.prisma.incidentErrorGroup.findUnique({
      where: {
        incidentId_errorGroupId: { incidentId: id, errorGroupId },
      },
    });
    if (!existing) throw new NotFoundException('Error group not linked to this incident');

    await this.prisma.incidentErrorGroup.delete({
      where: { incidentId_errorGroupId: { incidentId: id, errorGroupId } },
    });
  }

  async getFrequency(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where:   { id },
      include: { errorGroups: { select: { errorGroupId: true } } },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const groupIds = incident.errorGroups.map((eg) => eg.errorGroupId);
    if (groupIds.length === 0) return [];

    const uuids = groupIds.map((gid) => Prisma.sql`${gid}::uuid`);

    const rows = await this.prisma.$queryRaw<FrequencyRow[]>(Prisma.sql`
      SELECT
        date_trunc('hour', e.timestamp) AS bucket,
        e.level                         AS level,
        COUNT(*)::bigint                AS count
      FROM   events e
      WHERE  e.error_group_id = ANY(ARRAY[${Prisma.join(uuids)}])
        AND  e.timestamp >= NOW() - INTERVAL '7 days'
      GROUP  BY 1, 2
      ORDER  BY 1 ASC
    `);

    return rows.map((r) => ({
      bucket: r.bucket,
      level:  r.level,
      count:  Number(r.count),
    }));
  }

  private async ensureExists(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}
