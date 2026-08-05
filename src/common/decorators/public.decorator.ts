import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/// Libera a rota do JwtAuthGuard, que e global.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_PASSWORD_CHANGE_KEY = 'skipPasswordChange';

/// Rotas acessiveis mesmo com `mustChangePassword` ativo -- caso contrario o
/// usuario ficaria trancado sem conseguir trocar a propria senha.
export const SkipPasswordChangeCheck = () =>
  SetMetadata(SKIP_PASSWORD_CHANGE_KEY, true);
