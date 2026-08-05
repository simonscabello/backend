import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import type {
  CreateEventDto,
  DuplicateEventDto,
  UpdateEventDto,
} from './dto/event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  private assertRehearsal(startsAt: Date, rehearsalAt?: Date | null) {
    if (rehearsalAt && rehearsalAt > startsAt) {
      throw new BadRequestException({
        code: 'REHEARSAL_AFTER_START',
        message: 'O ensaio precisa ser antes ou no mesmo horário do culto.',
      });
    }
  }

  private toListItem(event: Event & { team?: { timezone: string } }) {
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
      assignments: [] as const,
      songs: [] as const,
    };
  }

  async create(teamId: string, createdById: string, dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    const rehearsalAt = dto.rehearsalAt ? new Date(dto.rehearsalAt) : null;
    this.assertRehearsal(startsAt, rehearsalAt);

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
      },
      include: { team: { select: { timezone: true } } },
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
      include: { team: { select: { timezone: true } } },
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
      throw new NotFoundException('Culto não encontrado.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    let rehearsalAt = existing.rehearsalAt;
    if (dto.rehearsalAt !== undefined) {
      rehearsalAt =
        dto.rehearsalAt === null ? null : new Date(dto.rehearsalAt);
    }
    this.assertRehearsal(startsAt, rehearsalAt);

    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.rehearsalAt !== undefined ? { rehearsalAt } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.colorPalette !== undefined
          ? { colorPalette: dto.colorPalette }
          : {}),
      },
    });
    return this.assignments.buildSchedule(eventId);
  }

  async remove(eventId: string) {
    try {
      await this.prisma.event.delete({ where: { id: eventId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Culto não encontrado.');
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
      include: { assignments: true, songs: true },
    });
    if (!source) {
      throw new NotFoundException('Culto não encontrado.');
    }

    const startsAt = new Date(dto.startsAt);
    let rehearsalAt: Date | null = null;
    if (source.rehearsalAt) {
      const deltaMs =
        source.startsAt.getTime() - source.rehearsalAt.getTime();
      rehearsalAt = new Date(startsAt.getTime() - deltaMs);
    }
    this.assertRehearsal(startsAt, rehearsalAt);

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
