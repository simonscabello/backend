import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PositionCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AssignmentItemDto } from './dto/assignment.dto';
import { toPublicServices } from '../events/event-services';
import { UnavailabilitiesService } from '../unavailabilities/unavailabilities.service';

type ScheduleAssignmentMember = {
  id: string;
  membershipId: string;
  displayName: string;
  note: string | null;
  isRegisteredForPosition: boolean;
};

type ScheduleAssignmentGroup = {
  positionId: string;
  positionName: string;
  sortOrder: number;
  members: ScheduleAssignmentMember[];
};

type SameDayConflict = {
  membershipId: string;
  displayName: string;
  otherEventId: string;
  otherEventTitle: string;
};

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unavailabilities: UnavailabilitiesService,
  ) {}

  /// Data civil no fuso da equipe (YYYY-MM-DD), para a regra 19.
  localDateKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  async replace(
    eventId: string,
    items: AssignmentItemDto[],
    ministerMembershipId?: string | null,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { team: { select: { timezone: true } } },
    });
    if (!event) {
      throw new NotFoundException('Escala não encontrada.');
    }

    const membershipIds = [...new Set(items.map((i) => i.membershipId))];
    const positionIds = [...new Set(items.map((i) => i.positionId))];

    const [memberships, positions] = await Promise.all([
      membershipIds.length
        ? this.prisma.membership.findMany({
            where: { teamId: event.teamId, id: { in: membershipIds } },
            include: { positions: { select: { positionId: true } } },
          })
        : Promise.resolve([]),
      positionIds.length
        ? this.prisma.position.findMany({
            where: { teamId: event.teamId, id: { in: positionIds } },
          })
        : Promise.resolve([]),
    ]);

    const membershipById = new Map(memberships.map((m) => [m.id, m]));
    const positionById = new Map(positions.map((p) => [p.id, p]));

    for (const item of items) {
      const membership = membershipById.get(item.membershipId);
      if (!membership) {
        throw new BadRequestException({
          code: 'MEMBERSHIP_NOT_IN_TEAM',
          message: 'Um dos membros não pertence a esta equipe.',
        });
      }
      if (membership.status === 'REMOVED') {
        throw new BadRequestException({
          code: 'MEMBERSHIP_REMOVED',
          message: 'Não é possível escalar um membro removido.',
        });
      }
      if (!positionById.has(item.positionId)) {
        throw new BadRequestException({
          code: 'POSITION_NOT_IN_TEAM',
          message: 'Uma das funções não pertence a esta equipe.',
        });
      }
    }

    this.assertRoleCombinations(items, membershipById, positionById);
    this.assertMinisterIsAssigned(ministerMembershipId, items);

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { eventId } });
      if (items.length > 0) {
        await tx.assignment.createMany({
          data: items.map((item) => ({
            eventId,
            membershipId: item.membershipId,
            positionId: item.positionId,
            note: item.note?.trim() || null,
          })),
        });
      }

      // `undefined` = o cliente não mandou o campo, então não se mexe.
      // `null` = pedido explícito de limpar. Esvaziar a escala também limpa:
      // ministrante sem escalação nenhuma não faz sentido.
      if (ministerMembershipId !== undefined || items.length === 0) {
        await tx.event.update({
          where: { id: eventId },
          data: {
            ministerMembershipId:
              items.length === 0 ? null : (ministerMembershipId ?? null),
          },
        });
      }
    });

    return this.buildSchedule(eventId);
  }

  /// O ministrante precisa estar escalado.
  ///
  /// Quem conduz a ministração está no culto, em alguma função. Aceitar alguém
  /// de fora da escala deixaria o texto compartilhado anunciando uma pessoa
  /// que não aparece em lugar nenhum da lista.
  private assertMinisterIsAssigned(
    ministerMembershipId: string | null | undefined,
    items: AssignmentItemDto[],
  ): void {
    if (!ministerMembershipId) return;

    const assigned = items.some(
      (item) => item.membershipId === ministerMembershipId,
    );
    if (!assigned) {
      throw new BadRequestException({
        code: 'MINISTER_NOT_ASSIGNED',
        message: 'O ministrante precisa estar escalado em alguma função.',
      });
    }
  }

  /// Combinações proibidas dentro de uma mesma escala.
  ///
  /// Duas regras que vêm da prática do culto, não do software:
  ///
  /// 1. Ninguém toca dois instrumentos ao mesmo tempo. Vocal acumula com um
  ///    instrumento (canta e toca violão), mas baixo e bateria não existem
  ///    juntos na mesma pessoa.
  /// 2. Quem está na multimídia ou no som fica fora da banda. São funções que
  ///    exigem a pessoa em outro lugar durante o culto inteiro.
  ///
  /// Valida no servidor mesmo com o app impedindo na tela: a regra é do
  /// domínio, e o app é só um dos clientes possíveis.
  private assertRoleCombinations(
    items: AssignmentItemDto[],
    membershipById: Map<string, { displayName: string }>,
    positionById: Map<string, { name: string; category: PositionCategory }>,
  ): void {
    const byMembership = new Map<
      string,
      { vocal: string[]; instruments: string[]; tech: string[] }
    >();

    for (const item of items) {
      const position = positionById.get(item.positionId);
      if (!position) continue;

      const entry = byMembership.get(item.membershipId) ?? {
        vocal: [],
        instruments: [],
        tech: [],
      };

      switch (position.category) {
        case 'INSTRUMENT':
          entry.instruments.push(position.name);
          break;
        case 'TECH':
          entry.tech.push(position.name);
          break;
        case 'VOCAL':
          entry.vocal.push(position.name);
          break;
        default:
          break;
      }

      byMembership.set(item.membershipId, entry);
    }

    for (const [membershipId, entry] of byMembership) {
      const name = membershipById.get(membershipId)?.displayName ?? 'A pessoa';

      if (entry.instruments.length > 1) {
        throw new BadRequestException({
          code: 'MULTIPLE_INSTRUMENTS',
          message:
            `${name} está em ${entry.instruments.join(' e ')}. ` +
            'Cada pessoa toca um instrumento por escala — vocal pode somar, ' +
            'dois instrumentos não.',
        });
      }

      const inBand = entry.vocal.length > 0 || entry.instruments.length > 0;
      if (entry.tech.length > 0 && inBand) {
        const bandRoles = [...entry.vocal, ...entry.instruments].join(' e ');
        throw new BadRequestException({
          code: 'TECH_WITH_BAND',
          message:
            `${name} está em ${entry.tech.join(' e ')} e também em ` +
            `${bandRoles}. Quem fica na multimídia ou no som não entra na banda.`,
        });
      }
    }
  }

  async buildSchedule(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        team: { select: { timezone: true } },
        minister: { select: { id: true, displayName: true } },
        services: {
          orderBy: { startsAt: 'asc' },
          select: { id: true, label: true, startsAt: true, sortOrder: true },
        },
        assignments: {
          include: {
            membership: {
              select: {
                id: true,
                displayName: true,
                positions: { select: { positionId: true } },
              },
            },
            position: {
              select: { id: true, name: true, sortOrder: true },
            },
          },
        },
      },
    });
    if (!event) {
      throw new NotFoundException('Escala não encontrada.');
    }

    const assignments = groupAssignments(event.assignments);

    // Quem avisou que não pode neste dia. Vai junto da escala para o app
    // marcar o badge na hora de escalar, sem uma segunda chamada.
    const unavailable = await this.unavailabilities.findForDate(
      event.teamId,
      this.localDateKey(event.startsAt, event.team.timezone),
    );

    const sameDayConflicts = await this.findSameDayConflicts(
      event.id,
      event.teamId,
      event.startsAt,
      event.team.timezone,
      event.assignments.map((a) => ({
        membershipId: a.membershipId,
        displayName: a.membership.displayName,
      })),
    );

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
      timezone: event.team.timezone,
      assignments,
      services: toPublicServices(event.services),
      minister: toPublicMinister(event.minister),
      songs: [] as const,
      unavailable,
      warnings: {
        sameDayConflicts,
        /// Gente escalada que já tinha avisado que não pode neste dia.
        unavailableAssigned: unavailable.filter((u) =>
          event.assignments.some((a) => a.membershipId === u.membershipId),
        ),
      },
    };
  }

  private async findSameDayConflicts(
    eventId: string,
    teamId: string,
    startsAt: Date,
    timeZone: string,
    assigned: Array<{ membershipId: string; displayName: string }>,
  ): Promise<SameDayConflict[]> {
    if (assigned.length === 0) {
      return [];
    }

    const membershipIds = [...new Set(assigned.map((a) => a.membershipId))];
    const displayNameById = new Map(
      assigned.map((a) => [a.membershipId, a.displayName]),
    );
    const eventDay = this.localDateKey(startsAt, timeZone);

    // Janela ampla em UTC; o filtro fino usa o fuso da equipe.
    const windowStart = new Date(startsAt.getTime() - 36 * 60 * 60 * 1000);
    const windowEnd = new Date(startsAt.getTime() + 36 * 60 * 60 * 1000);

    const candidates = await this.prisma.event.findMany({
      where: {
        teamId,
        id: { not: eventId },
        startsAt: { gte: windowStart, lte: windowEnd },
        assignments: { some: { membershipId: { in: membershipIds } } },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        assignments: {
          where: { membershipId: { in: membershipIds } },
          select: { membershipId: true },
        },
      },
    });

    const conflicts: SameDayConflict[] = [];
    const seen = new Set<string>();

    for (const other of candidates) {
      if (this.localDateKey(other.startsAt, timeZone) !== eventDay) {
        continue;
      }
      for (const a of other.assignments) {
        const key = `${a.membershipId}:${other.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        conflicts.push({
          membershipId: a.membershipId,
          displayName: displayNameById.get(a.membershipId) ?? '',
          otherEventId: other.id,
          otherEventTitle: other.title,
        });
      }
    }

    return conflicts;
  }
}

/// Linha de escalação como vem do banco, com o mínimo necessário para agrupar.
export type AssignmentRow = {
  id: string;
  note: string | null;
  positionId: string;
  membershipId: string;
  position: { id: string; name: string; sortOrder: number };
  membership: {
    id: string;
    displayName: string;
    positions: { positionId: string }[];
  };
};

/// Quem conduz a ministração do louvor, no formato que o app consome.
export function toPublicMinister(
  minister: { id: string; displayName: string } | null | undefined,
) {
  if (!minister) return null;
  return { membershipId: minister.id, displayName: minister.displayName };
}

/// Agrupa a escalação por função, ordenando as funções pela ordem do catálogo
/// da equipe e as pessoas por nome.
///
/// Função pura e exportada porque a agenda (lista) e a escala (detalhe)
/// precisam do mesmo formato: se cada uma agrupasse do seu jeito, o app teria
/// dois contratos para a mesma informação.
export function groupAssignments(
  rows: AssignmentRow[],
): ScheduleAssignmentGroup[] {
  const registeredByMembership = new Map<string, Set<string>>();
  for (const row of rows) {
    registeredByMembership.set(
      row.membership.id,
      new Set(row.membership.positions.map((p) => p.positionId)),
    );
  }

  const groupMap = new Map<string, ScheduleAssignmentGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.positionId);
    if (!group) {
      group = {
        positionId: row.position.id,
        positionName: row.position.name,
        sortOrder: row.position.sortOrder,
        members: [],
      };
      groupMap.set(row.positionId, group);
    }

    const registered = registeredByMembership.get(row.membershipId) ?? new Set();
    group.members.push({
      id: row.id,
      membershipId: row.membershipId,
      displayName: row.membership.displayName,
      note: row.note,
      isRegisteredForPosition: registered.has(row.positionId),
    });
  }

  const groups = [...groupMap.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.positionName.localeCompare(b.positionName, 'pt-BR');
  });

  for (const group of groups) {
    group.members.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'pt-BR'),
    );
  }

  return groups;
}
