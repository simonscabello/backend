import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Minutos desde a meia-noite. 1439 = 23:59.
const MAX_MINUTE_OF_DAY = 24 * 60 - 1;

export class CreateServiceTemplateDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o nome do culto.' })
  @MaxLength(60)
  label!: string;

  @IsInt({ message: 'Dia da semana inválido.' })
  @Min(0, { message: 'Dia da semana inválido.' })
  @Max(6, { message: 'Dia da semana inválido.' })
  weekday!: number;

  @IsInt({ message: 'Horário do culto inválido.' })
  @Min(0, { message: 'Horário do culto inválido.' })
  @Max(MAX_MINUTE_OF_DAY, { message: 'Horário do culto inválido.' })
  startMinutes!: number;
}

export class UpdateServiceTemplateDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Informe o nome do culto.' })
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsInt({ message: 'Dia da semana inválido.' })
  @Min(0, { message: 'Dia da semana inválido.' })
  @Max(6, { message: 'Dia da semana inválido.' })
  weekday?: number;

  @IsOptional()
  @IsInt({ message: 'Horário do culto inválido.' })
  @Min(0, { message: 'Horário do culto inválido.' })
  @Max(MAX_MINUTE_OF_DAY, { message: 'Horário do culto inválido.' })
  startMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /// Quando `true`, os cultos das escalas **futuras** que vieram desta linha da
  /// grade recebem o rótulo e o horário novos.
  ///
  /// Default `false` de propósito: mudar a grade não pode reescrever, em
  /// silêncio, escala que já foi divulgada no WhatsApp. O app pergunta antes,
  /// usando `GET .../future-events` para saber quantas seriam afetadas.
  @IsOptional()
  @IsBoolean()
  applyToFutureEvents?: boolean;
}
