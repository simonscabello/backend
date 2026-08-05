import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  mustChangePassword: boolean;
  typ: 'access';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /// Validade do access token, em segundos.
  expiresIn: number;
}

interface TokenUser {
  id: string;
  email: string;
  mustChangePassword: boolean;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /// O refresh token e opaco (nao e JWT) e so o hash e persistido: vazar o
  /// banco nao entrega sessoes utilizaveis.
  async issue(user: TokenUser): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      typ: 'access',
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(refreshToken),
        expiresAt: new Date(
          Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    };
  }

  /// Rotaciona: o refresh token usado e revogado e um novo par e emitido.
  async rotate(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash(refreshToken) },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Sessao inválida. Entre novamente.');
    }

    // Token ja revogado sendo reapresentado: ou e replay, ou o refresh token
    // vazou. Derruba todas as sessoes do usuario por precaucao.
    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Sessao inválida. Entre novamente.');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sessao expirada. Entre novamente.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issue({
      id: stored.user.id,
      email: stored.user.email,
      mustChangePassword: stored.user.mustChangePassword,
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /// Usado na troca de senha e no reset pelo OWNER (regra 27).
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
