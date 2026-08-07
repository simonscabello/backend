import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AVATARS_FOLDER, StorageService } from '../storage/storage.service';
import { toPublicUser, type PublicUser } from './public-user';
import type { UpdateMeDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    if (dto.name === undefined && dto.email === undefined) {
      throw new BadRequestException({
        code: 'NOTHING_TO_UPDATE',
        message: 'Informe ao menos um campo para alterar.',
      });
    }

    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId },
          data: { name: dto.name, email: dto.email },
        });

        // O nome dentro da equipe acompanha, mas so quando ninguem o
        // personalizou: o lider pode ter trocado "Jose Carlos da Silva" por
        // "Zeca", e corrigir o nome da conta nao deve desfazer isso.
        if (dto.name && dto.name !== current.name) {
          await tx.membership.updateMany({
            where: { userId, displayName: current.name },
            data: { displayName: dto.name },
          });
        }

        return updated;
      });

      return toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_USED',
          message: 'Ja existe uma conta com este e-mail.',
        });
      }
      throw error;
    }
  }

  /// O e-mail do access token fica desatualizado ate a proxima renovacao, e
  /// tudo bem: nada na API decide nada por ele -- a identidade e o `sub`.
  async setAvatar(userId: string, bytes: Buffer): Promise<PublicUser> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarPath: true },
    });

    const stored = await this.storage.saveImage(AVATARS_FOLDER, bytes);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: stored.path },
    });

    // So depois de o banco apontar para a nova: se algo falhar no meio, sobra
    // um arquivo orfao (barato) em vez de um avatar quebrado (visivel).
    await this.storage.remove(current.avatarPath);

    return toPublicUser(user);
  }

  async removeAvatar(userId: string): Promise<PublicUser> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarPath: true },
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: null },
    });

    await this.storage.remove(current.avatarPath);

    return toPublicUser(user);
  }
}
