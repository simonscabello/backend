import { Injectable, NotFoundException } from '@nestjs/common';
import { type ServiceTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { replaceTimeOfDay } from '../../common/timezone';
import type {
  CreateServiceTemplateDto,
  UpdateServiceTemplateDto,
} from './dto/service-template.dto';

@Injectable()
export class ServiceTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(teamId: string, includeInactive: boolean) {
    const templates = await this.prisma.serviceTemplate.findMany({
      where: { teamId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ weekday: 'asc' }, { startMinutes: 'asc' }],
    });
    return templates.map(toPublicServiceTemplate);
  }

  async create(teamId: string, dto: CreateServiceTemplateDto) {
    const last = await this.prisma.serviceTemplate.findFirst({
      where: { teamId },
      orderBy: { sortOrder: 'desc' },
    });

    const created = await this.prisma.serviceTemplate.create({
      data: {
        teamId,
        label: dto.label,
        weekday: dto.weekday,
        startMinutes: dto.startMinutes,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return toPublicServiceTemplate(created);
  }

  /// Escalas futuras que usam esta linha da grade.
  ///
  /// O app chama antes de salvar, para perguntar "3 escalas futuras usam este
  /// culto, atualizar também?" em vez de decidir sozinho.
  async futureEvents(teamId: string, templateId: string) {
    await this.findOrFail(teamId, templateId);

    const services = await this.prisma.eventService.findMany({
      where: {
        templateId,
        event: { teamId, startsAt: { gte: new Date() } },
      },
      orderBy: { startsAt: 'asc' },
      include: { event: { select: { id: true, title: true, startsAt: true } } },
    });

    return services.map((service) => ({
      eventId: service.event.id,
      title: service.event.title,
      // O horário do culto, e não o da escala: é ele que mudaria.
      startsAt: service.startsAt.toISOString(),
      label: service.label,
    }));
  }

  async update(teamId: string, templateId: string, dto: UpdateServiceTemplateDto) {
    const existing = await this.findOrFail(teamId, templateId);

    const updated = await this.prisma.serviceTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.weekday !== undefined ? { weekday: dto.weekday } : {}),
        ...(dto.startMinutes !== undefined
          ? { startMinutes: dto.startMinutes }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    const applied = dto.applyToFutureEvents
      ? await this.applyToFutureEvents(teamId, existing, updated)
      : 0;

    return { ...toPublicServiceTemplate(updated), updatedEvents: applied };
  }

  /// Repassa rótulo e horário novos para as escalas futuras vinculadas.
  ///
  /// **A data não muda**, nem quando o dia da semana da grade muda: mover uma
  /// escala de domingo para quinta porque a grade da igreja mudou seria uma
  /// surpresa grande demais para um botão de confirmação. O dia novo vale para
  /// as escalas criadas dali em diante.
  private async applyToFutureEvents(
    teamId: string,
    before: ServiceTemplate,
    after: ServiceTemplate,
  ): Promise<number> {
    const timeChanged = before.startMinutes !== after.startMinutes;
    const labelChanged = before.label !== after.label;
    if (!timeChanged && !labelChanged) return 0;

    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { timezone: true },
    });

    const services = await this.prisma.eventService.findMany({
      where: {
        templateId: after.id,
        event: { teamId, startsAt: { gte: new Date() } },
      },
      select: { id: true, eventId: true, startsAt: true },
    });
    if (services.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      for (const service of services) {
        await tx.eventService.update({
          where: { id: service.id },
          data: {
            ...(labelChanged ? { label: after.label } : {}),
            ...(timeChanged
              ? {
                  startsAt: replaceTimeOfDay(
                    service.startsAt,
                    after.startMinutes,
                    team.timezone,
                  ),
                }
              : {}),
          },
        });
      }

      if (!timeChanged) return;

      // `events.starts_at` é o culto mais cedo da escala. Mudar o horário de um
      // culto pode trocar qual deles vem primeiro, e a agenda ordena por esse
      // campo -- sem recalcular, a escala apareceria na posição errada.
      for (const eventId of new Set(services.map((s) => s.eventId))) {
        const earliest = await tx.eventService.findFirst({
          where: { eventId },
          orderBy: { startsAt: 'asc' },
        });
        if (earliest) {
          await tx.event.update({
            where: { id: eventId },
            data: { startsAt: earliest.startsAt },
          });
        }
      }
    });

    return services.length;
  }

  async remove(teamId: string, templateId: string) {
    await this.findOrFail(teamId, templateId);
    // Os cultos já escalados sobrevivem: `event_services` guarda a cópia do
    // rótulo e do horário, e só o vínculo (`template_id`) vira nulo.
    await this.prisma.serviceTemplate.delete({ where: { id: templateId } });
  }

  private async findOrFail(teamId: string, templateId: string) {
    const template = await this.prisma.serviceTemplate.findFirst({
      where: { id: templateId, teamId },
    });
    if (!template) {
      throw new NotFoundException('Culto não encontrado na grade da equipe.');
    }
    return template;
  }
}

function toPublicServiceTemplate(template: ServiceTemplate) {
  return {
    id: template.id,
    label: template.label,
    weekday: template.weekday,
    startMinutes: template.startMinutes,
    sortOrder: template.sortOrder,
    isActive: template.isActive,
  };
}
