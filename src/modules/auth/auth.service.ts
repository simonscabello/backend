import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService, type TokenPair } from './token.service';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface SessionResponse extends TokenPair {
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
  teams: {
    membershipId: string;
    teamId: string;
    name: string;
    role: string;
    displayName: string;
  }[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<SessionResponse> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.user.create({
        data: { name: dto.name, email: dto.email, passwordHash },
      });
      return this.buildSession(user);
    } catch (error) {
      // Corrida entre duas requisicoes com o mesmo e-mail: o indice unico e a
      // fonte da verdade, nao uma consulta previa.
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

  async login(dto: LoginDto): Promise<SessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Mesma mensagem para e-mail inexistente e senha errada: nao revela quais
    // e-mails tem conta.
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha incorretos.',
    });

    if (!user) {
      // Verifica um hash descartavel para o tempo de resposta nao denunciar a
      // ausencia da conta.
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      throw invalid;
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw invalid;
    }

    return this.buildSession(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<SessionResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Senha atual incorreta.',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(dto.newPassword, {
          type: argon2.argon2id,
        }),
        mustChangePassword: false,
      },
    });

    // Trocar a senha derruba as outras sessoes; o proprio aparelho recebe um
    // par novo na resposta.
    await this.tokens.revokeAllForUser(userId);

    return this.buildSession(updated);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { team: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      user: toPublicUser(user),
      teams: user.memberships.map((m) => ({
        membershipId: m.id,
        teamId: m.teamId,
        name: m.team.name,
        role: m.role,
        displayName: m.displayName,
      })),
    };
  }

  private async buildSession(user: {
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
  }): Promise<SessionResponse> {
    const tokens = await this.tokens.issue(user);
    return { ...tokens, user: toPublicUser(user) };
  }
}

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
  };
}

/// Hash argon2id de uma senha aleatoria, usado so para gastar tempo quando o
/// e-mail nao existe.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1zYWx0LXZhbHVl$KJ8vLQFP3wCkDvXqSm0lJ0nGZ2mYqBqvT0M1kqXwZ2s';
