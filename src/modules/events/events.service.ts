import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignmentsService,
  groupAssignments,
  toPublicMinister,
  type AssignmentRow,
} from '../assignments/assignments.service';
import type {
  CreateEventDto,
  DuplicateEventDto,
  EventServiceDto,
  UpdateEventDto,
} from './dto/event.dto';
import {
  normalizeServices,
  toPublicServices,
  type ServiceRow,
} from './event-services';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  /// O ensaio precisa vir antes do **último** culto da escala, não do primeiro.
  ///
  /// No domingo da equipe o ensaio é "após a EBD": acontece depois do culto da
  /// manhã e antes do da noite. Comparar com o primeiro culto rejeitava o caso
  /// real. O que continua sendo erro é ensaio marcado depois de tudo -- aí não
  /// há o que ensaiar.
  private assertRehearsal(lastServiceAt: Date, rehearsalAt?: Date | null) {
    if (rehearsalAt && rehearsalAt > lastServiceAt) {
      throw new BadRequestException({
        code: 'REHEARSAL_AFTER_START',
        message:
          'O ensaio precisa ser antes ou no mesmo horário do último culto.',
      });
    }
  }

  private toListItem(
    event: Event & {
      team?: { timezone: string };
      assignments?: AssignmentRow[];
      services?: ServiceRow[];
      minister?: { id: string; displayName: string } | null;
    },
  ) {
    return {
      id: event.id,
      teamId: event.teamId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      rehearsalAt: event.rehearsalAt?.toISOString() ?? null,
      location: event.location,
      notes: event.notes,
      colorPalette: event.colorPalette,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      timezone: event.team?.timezone,
      // A agenda precisa da escalação: é dela que saem o "VOCÊ: Guitarra" nos
      // cards e o aviso de que ninguém foi escalado. Sem isso o membro teria
      // de abrir culto por culto para descobrir onde toca.
      assignments: groupAssignments(event.assignments ?? []),
      services: toPublicServices(event.services ?? []),
      minister: toPublicMinister(event.minister),
      songs: [] as const,
    };
  }

  /// Só o necessário para montar a escalação agrupada da listagem.
  private static readonly assignmentInclude = {
    include: {
      membership: {
        select: {
          id: true,
          displayName: true,
          positions: { select: { positionId: true } },
        },
      },
      position: { select: { id: true, name: true, sortOrder: true } },
    },
  } as const;

  static readonly serviceInclude = {
    orderBy: { startsAt: 'asc' },
    select: { id: true, label: true, startsAt: true, sortOrder: true },
  } as const;

  async create(teamId: string, createdById: string, dto: CreateEventDto) {
    const services = normalizeServices(dto.services);
    // O instante da escala é o culto mais cedo: é ele que a agenda ordena e
    // que decide se a escala já passou.
    const startsAt = services[0].startsAt;
    const rehearsalAt = dto.rehearsalAt ? new Date(dto.rehearsalAt) : null;
    this.assertRehearsal(services[services.length - 1].startsAt, rehearsalAt);

    const event = await this.prisma.event.create({
      data: {
        teamId,
        createdById,
        title: dto.title,
        startsAt,
        rehearsalAt,
        location: dto.location,
        notes: dto.notes,
        colorPalette: dto.colorPalette,
        status: 'PUBLISHED',
        services: { create: services },
      },
      include: {
        team: { select: { timezone: true } },
        services: EventsService.serviceInclude,
        minister: { select: { id: true, displayName: true } },
      },
    });
    return this.toListItem(event);
  }

  async list(teamId: string, scope: 'upcoming' | 'past', limit: number) {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        teamId,
        startsAt: scope === 'upcoming' ? { gte: now } : { lt: now },
      },
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
      include: {
        team: { select: { timezone: true } },
        assignments: EventsService.assignmentInclude,
        services: EventsService.serviceInclude,
        minister: { select: { id: true, displayName: true } },
      },
    });
    return events.map((e) => this.toListItem(e));
  }

  async findOne(eventId: string) {
    return this.assignments.buildSchedule(eventId);
  }

  async update(eventId: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!existing) {
      throw new NotFoundException('Escala não encontrada.');
    }

    // Omitir `services` mantém os cultos que já existem: editar só o local não
    // pode apagar os horários.
    const services = dto.services ? normalizeServices(dto.services) : null;

    let rehearsalAt = existing.rehearsalAt;
    if (dto.rehearsalAt !== undefined) {
      rehearsalAt =
        dto.rehearsalAt === null ? null : new Date(dto.rehearsalAt);
    }

    const lastServiceAt = services
      ? services[services.length - 1].startsAt
      : await this.lastServiceAt(eventId, existing.startsAt);
    this.assertRehearsal(lastServiceAt, rehearsalAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(services ? { startsAt: services[0].startsAt } : {}),
          ...(dto.rehearsalAt !== undefined ? { rehearsalAt } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.colorPalette !== undefined
            ? { colorPalette: dto.colorPalette }
            : {}),
        },
      });

      if (services) {
        // Troca a lista inteira: os cultos não têm identidade própria para o
        // usuário -- ele pensa "os horários deste domingo são estes".
        await tx.eventService.deleteMany({ where: { eventId } });
        await tx.eventService.createMany({
          data: services.map((service) => ({ ...service, eventId })),
        });
      }
    });

    return this.assignments.buildSchedule(eventId);
  }

  private async lastServiceAt(eventId: string, fallback: Date) {
    const last = await this.prisma.eventService.findFirst({
      where: { eventId },
      orderBy: { startsAt: 'desc' },
    });
    return last?.startsAt ?? fallback;
  }

  async remove(eventId: string) {
    try {
      await this.prisma.event.delete({ where: { id: eventId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Escala não encontrada.');
      }
      throw error;
    }
  }

  /// Copia culto, escalação e setlist para uma nova data, mantendo a diferença
  /// entre ensaio e culto (quando houver ensaio).
  async duplicate(
    eventId: string,
    createdById: string,
    dto: DuplicateEventDto,
  ) {
    const source = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { assignments: true, songs: true, services: true },
    });
    if (!source) {
      throw new NotFoundException('Escala não encontrada.');
    }

    const startsAt = new Date(dto.startsAt);
    let rehearsalAt: Date | null = null;
    if (source.rehearsalAt) {
      const deltaMs =
        source.startsAt.getTime() - source.rehearsalAt.getTime();
      rehearsalAt = new Date(startsAt.getTime() - deltaMs);
    }

    // Cada culto anda o mesmo tanto que o começo da escala. Duplicar um
    // domingo de 08:30 e 18:00 para o domingo seguinte às 08:30 tem de
    // devolver 08:30 e 18:00 -- e não dois cultos às 08:30.
    const shiftMs = startsAt.getTime() - source.startsAt.getTime();
    const services = source.services
      .map((service) => ({
        label: service.label,
        startsAt: new Date(service.startsAt.getTime() + shiftMs),
        sortOrder: service.sortOrder,
        templateId: service.templateId,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    this.assertRehearsal(
      services.length > 0
        ? services[services.length - 1].startsAt
        : startsAt,
      rehearsalAt,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          teamId: source.teamId,
          createdById,
          title: source.title,
          startsAt,
          rehearsalAt,
          location: source.location,
          notes: source.notes,
          colorPalette: source.colorPalette,
          status: 'PUBLISHED',
          // A escalação é copiada junto, então o ministrante continua sendo
          // alguém escalado na cópia.
          ministerMembershipId: source.ministerMembershipId,
          services: {
            create: services.length > 0
              ? services
              : [{ label: 'Culto', startsAt, sortOrder: 0 }],
          },
        },
      });

      if (source.assignments.length > 0) {
        await tx.assignment.createMany({
          data: source.assignments.map((a) => ({
            eventId: event.id,
            membershipId: a.membershipId,
            positionId: a.positionId,
            note: a.note,
          })),
        });
      }

      if (source.songs.length > 0) {
        await tx.eventSong.createMany({
          data: source.songs.map((s) => ({
            eventId: event.id,
            songId: s.songId,
            position: s.position,
            keyOverride: s.keyOverride,
            note: s.note,
          })),
        });
      }

      return event;
    });

    return this.assignments.buildSchedule(created.id);
  }
}
