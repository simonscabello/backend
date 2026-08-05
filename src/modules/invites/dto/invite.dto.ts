import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInviteDto {
  /// Preenchido para convite individual: quem aceitar assume este cadastro,
  /// herdando funções e historico de escalas.
  @IsOptional()
  @IsUUID('4')
  membershipId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  /// Ausente = ilimitado (util para o link geral da equipe).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxUses?: number;
}

export class AcceptInviteDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Informe o código do convite.' })
  code!: string;
}
