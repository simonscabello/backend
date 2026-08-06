import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMemberDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do membro.' })
  @MaxLength(120)
  displayName!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /// Funcoes que o membro sabe exercer.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  positionIds?: string[];

  /// Musico de fora convidado para uma ocasiao: entra na escala e no texto
  /// compartilhado, mas nao vira integrante da equipe nem recebe convite.
  @IsOptional()
  @IsBoolean()
  isGuest?: boolean;
}

export class UpdateMemberDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /// OWNER nao entra: transferencia de posse e um fluxo proprio, fora do MVP.
  @IsOptional()
  @IsIn(['LEADER', 'MEMBER'], {
    message: 'Papel deve ser LEADER ou MEMBER.',
  })
  role?: 'LEADER' | 'MEMBER';

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  positionIds?: string[];
}
