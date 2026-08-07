import { UPLOADS_PREFIX } from '../storage/storage.service';

/// O usuario como o app o ve. Nunca inclui hash de senha.
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  /// Caminho relativo ao host da API (ex.: "/uploads/avatars/x.jpg"), nao uma
  /// URL absoluta: o mesmo banco responde em localhost, no 10.0.2.2 do
  /// emulador e no dominio do Railway. Quem monta o endereco final e o app.
  avatarUrl: string | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  avatarPath?: string | null;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: avatarUrl(user.avatarPath),
  };
}

export function avatarUrl(path: string | null | undefined): string | null {
  return path ? `${UPLOADS_PREFIX}/${path}` : null;
}
