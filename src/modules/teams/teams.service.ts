import { Injectable } from '@nestjs/common';
import { PositionCategory, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateTeamDto, UpdateTeamDto } from './dto/team.dto';

/// Catalogo inicial semeado em toda equipe nova. A equipe pode renomear,
/// desativar ou acrescentar funções depois -- por isso e copia, nao referencia.
const DEFAULT_POSITIONS: {
  name: string;
  category: PositionCategory;
}[] = [
  { name: 'Vocalista', category: PositionCategory.VOCAL },
  { name: 'Violão', category: PositionCategory.INSTRUMENT },
  { name: 'Guitarra', category: PositionCategory.INSTRUMENT },
  { name: 'Baixo', category: PositionCategory.INSTRUMENT },
  { name: 'Teclado', category: PositionCategory.INSTRUMENT },
  { name: 'Bateria', category: PositionCategory.INSTRUMENT },
  // Apoio: entram na escala do culto, mas nao acumulam com a banda.
  { name: 'Multimídia', category: PositionCategory.TECH },
  { name: 'Som', category: PositionCategory.TECH },
  // OTHER de proposito: direcao nao e banda nem apoio tecnico, e nao entra em
  // nenhuma das duas regras de escalacao -- quem dirige o culto pode tambem
  // cantar ou tocar.
  { name: 'Direção do culto', category: PositionCategory.OTHER },
];

/// Grade de cultos inicial. Ponto de partida editavel, nao regra: a tela de
/// nova escala precisa abrir com alguma coisa, e a alternativa era o lider
/// digitar rotulo e horario na primeira vez.
///
/// `startMinutes` = minutos desde a meia-noite (08:30 = 510). `weekday` segue
/// o `Date.getDay()`: 0 = domingo.
const DEFAULT_SERVICE_TEMPLATES: {
  label: string;
  weekday: number;
  startMinutes: number;
}[] = [
  { label: 'Manhã', weekday: 0, startMinutes: 8 * 60 + 30 },
  { label: 'Noite', weekday: 0, startMinutes: 19 * 60 },
  { label: 'Quinta', weekday: 4, startMinutes: 19 * 60 + 30 },
];

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userName: string, dto: CreateTeamDto) {
    const team = await this.prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: dto.name,
          timezone: dto.timezone ?? 'America/Sao_Paulo',
          createdById: userId,
          positions: {
            create: DEFAULT_POSITIONS.map((position, index) => ({
              ...position,
              sortOrder: index,
            })),
          },
          serviceTemplates: {
            create: DEFAULT_SERVICE_TEMPLATES.map((template, index) => ({
              ...template,
              sortOrder: index,
            })),
          },
          memberships: {
            create: {
              userId,
              displayName: dto.displayName ?? userName,
              role: 'OWNER',
              joinedAt: new Date(),
            },
          },
        },
        include: {
          positions: { orderBy: { sortOrder: 'asc' } },
          memberships: true,
        },
      });

      return created;
    });

    return {
      ...toPublicTeam(team),
      membership: {
        id: team.memberships[0].id,
        role: team.memberships[0].role,
        displayName: team.memberships[0].displayName,
      },
      positions: team.positions.map(toPublicPosition),
    };
  }

  async findOne(teamId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: {
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
    });

    return { ...toPublicTeam(team), memberCount: team._count.memberships };
  }

  async update(teamId: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.update({
      where: { id: teamId },
      data: dto as Prisma.TeamUpdateInput,
    });

    return toPublicTeam(team);
  }
}

function toPublicTeam(team: {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
}) {
  return {
    id: team.id,
    name: team.name,
    timezone: team.timezone,
    createdAt: team.createdAt,
  };
}

function toPublicPosition(position: {
  id: string;
  name: string;
  category: PositionCategory;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: position.id,
    name: position.name,
    category: position.category,
    sortOrder: position.sortOrder,
    isActive: position.isActive,
  };
}

export { toPublicPosition };
