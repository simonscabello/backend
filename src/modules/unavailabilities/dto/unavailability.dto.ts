import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateUnavailabilityDto {
  /// Dias civis no formato YYYY-MM-DD. Aceita vários de uma vez porque a tela
  /// permite marcar um período (viagem, por exemplo) em um toque só.
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe ao menos um dia.' })
  @ArrayMaxSize(120)
  @IsISO8601(
    { strict: true },
    { each: true, message: 'Data inválida. Use o formato AAAA-MM-DD.' },
  )
  dates!: string[];

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string;

  /// Só LEADER+ pode marcar por outra pessoa — acontece quando o integrante
  /// avisa pessoalmente e o líder registra por ele.
  @IsOptional()
  @IsUUID('4')
  membershipId?: string;
}

export class ListUnavailabilityQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
