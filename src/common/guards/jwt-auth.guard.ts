import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_PUBLIC_KEY,
  SKIP_PASSWORD_CHANGE_KEY,
} from '../decorators/public.decorator';
import type { RequestWithUser } from '../decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../modules/auth/token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Você precisa estar autenticado.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(
        header.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException('Sessao expirada. Entre novamente.');
    }

    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token inválido.');
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      mustChangePassword: payload.mustChangePassword === true,
    };

    const skipPasswordCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_PASSWORD_CHANGE_KEY,
      targets,
    );

    if (request.user.mustChangePassword && !skipPasswordCheck) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Defina uma nova senha para continuar.',
      });
    }

    return true;
  }
}
