import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicPosition } from '../teams/teams.service';
import type { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(teamId: string, includeInactive: boolean) {
    const positions = await this.prisma.position.findMany({
      where: { teamId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return positions.map(toPublicPosition);
  }

  async create(teamId: string, dto: CreatePositionDto) {
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(teamId));

    try {
      const position = await this.prisma.position.create({
        data: {
          teamId,
          name: dto.name,
          category: dto.category,
          sortOrder,
        },
      });
      return toPublicPosition(position);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(teamId: string, positionId: string, dto: UpdatePositionDto) {
    await this.findInTeam(teamId, positionId);

    try {
      const position = await this.prisma.position.update({
        where: { id: positionId },
        data: dto,
      });
      return toPublicPosition(position);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /// Funcao nao e excluida, e desativada: escalas passadas continuam validas
  /// (regra 11).
  async deactivate(teamId: string, positionId: string) {
    await this.findInTeam(teamId, positionId);

    const position = await this.prisma.position.update({
      where: { id: positionId },
      data: { isActive: false },
    });

    return toPublicPosition(position);
  }

  private async findInTeam(teamId: string, positionId: string) {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, teamId },
    });

    if (!position) {
      throw new NotFoundException('Funcao nao encontrada nesta equipe.');
    }

    return position;
  }

  private async nextSortOrder(teamId: string): Promise<number> {
    const last = await this.prisma.position.findFirst({
      where: { teamId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? -1) + 1;
  }

  private translate(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException({
        code: 'POSITION_ALREADY_EXISTS',
        message: 'Ja existe uma função com este nome na equipe.',
      });
    }

    return error as Error;
  }
}
