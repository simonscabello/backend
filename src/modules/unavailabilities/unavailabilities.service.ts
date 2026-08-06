import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateUnavailabilityDto,
  ListUnavailabilityQueryDto,
} from './dto/unavailability.dto';

/// Converte 'YYYY-MM-DD' em Date à meia-noite UTC.
///
/// A coluna é `date` (sem hora): gravar assim mantém o dia exatamente como a
/// pessoa marcou, sem o fuso empurrar para o dia anterior.
function toDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class UnavailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(teamId: string, query: ListUnavailabilityQueryDto) {
    const items = await this.prisma.unavailability.findMany({
      where: {
        membership: { teamId, status: 'ACTIVE' },
        date: {
          ...(query.from ? { gte: toDateOnly(query.from) } : {}),
          ...(query.to ? { lte: toDateOnly(query.to) } : {}),
        },
      },
      include: { membership: { select: { id: true, displayName: true } } },
      orderBy: [{ date: 'asc' }],
    });

    return items.map((item) => ({
      id: item.id,
      membershipId: item.membershipId,
      displayName: item.membership.displayName,
      date: toDateKey(item.date),
      reason: item.reason,
    }));
  }

  async listMine(membershipId: string) {
    const items = await this.prisma.unavailability.findMany({
      where: { membershipId },
      orderBy: [{ date: 'asc' }],
    });

    return items.map((item) => ({
      id: item.id,
      membershipId: item.membershipId,
      date: toDateKey(item.date),
      reason: item.reason,
    }));
  }

  async create(
    teamId: string,
    actor: Membership,
    dto: CreateUnavailabilityDto,
  ) {
    const targetId = dto.membershipId ?? actor.id;

    if (targetId !== actor.id && actor.role === 'MEMBER') {
      throw new ForbiddenException(
        'Você só pode marcar a sua própria indisponibilidade.',
      );
    }

    if (targetId !== actor.id) {
      const target = await this.prisma.membership.findFirst({
        where: { id: targetId, teamId, status: 'ACTIVE' },
      });
      if (!target) {
        throw new NotFoundException('Membro não encontrado nesta equipe.');
      }
    }

    const dates = [...new Set(dto.dates.map((d) => d.slice(0, 10)))];
    const today = toDateKey(new Date());
    if (dates.some((d) => d < today)) {
      throw new BadRequestException({
        code: 'DATE_IN_THE_PAST',
        message: 'Não é possível marcar indisponibilidade em dias passados.',
      });
    }

    // skipDuplicates: marcar de novo um dia já marcado não pode dar erro.
    await this.prisma.unavailability.createMany({
      data: dates.map((date) => ({
        membershipId: targetId,
        date: toDateOnly(date),
        reason: dto.reason || null,
      })),
      skipDuplicates: true,
    });

    return this.listMine(targetId);
  }

  async remove(teamId: string, id: string, actor: Membership) {
    const item = await this.prisma.unavailability.findFirst({
      where: { id, membership: { teamId } },
    });

    if (!item) {
      throw new NotFoundException('Indisponibilidade não encontrada.');
    }

    if (item.membershipId !== actor.id && actor.role === 'MEMBER') {
      throw new ForbiddenException(
        'Você só pode remover a sua própria indisponibilidade.',
      );
    }

    await this.prisma.unavailability.delete({ where: { id } });
  }

  /// Quem avisou que não pode em um dia civil específico.
  /// Usado pela escala para marcar o badge de indisponível.
  async findForDate(teamId: string, dateKey: string) {
    const items = await this.prisma.unavailability.findMany({
      where: {
        date: toDateOnly(dateKey),
        membership: { teamId, status: 'ACTIVE' },
      },
      include: { membership: { select: { id: true, displayName: true } } },
    });

    return items.map((item) => ({
      membershipId: item.membershipId,
      displayName: item.membership.displayName,
      reason: item.reason,
    }));
  }
}
