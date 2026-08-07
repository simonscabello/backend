import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Um horario de culto dentro da escala do dia ("Manha 08:30", "Noite 19:00").
export class EventServiceDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o nome do culto.' })
  @MaxLength(60)
  label!: string;

  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt!: string;

  /// De qual linha da grade este culto veio. Nulo em culto avulso (Pascoa,
  /// especial). E o que permite saber, ao mexer na grade, quais escalas
  /// futuras seriam afetadas.
  @IsOptional()
  @IsUUID('4', { message: 'Culto da grade inválido.' })
  templateId?: string | null;
}

export class CreateEventDto {
  /// So em culto especial ("Pascoa", "Ceia"). O domingo comum nao precisa de
  /// nome: a data e os horarios ja identificam a escala.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'A escala precisa de pelo menos um culto.' })
  @ArrayMaxSize(6, { message: 'No máximo 6 cultos por escala.' })
  @ValidateNested({ each: true })
  @Type(() => EventServiceDto)
  services!: EventServiceDto[];

  @IsOptional()
  @IsDateString({}, { message: 'Data do ensaio inválida.' })
  rehearsalAt?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string;
}

export class UpdateEventDto {
  /// String vazia limpa o titulo -- e como o formulario devolve um campo que
  /// o lider apagou.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /// Substitui a lista inteira de cultos. Omitir mantem os que ja existem --
  /// editar so o local nao pode apagar os horarios.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'A escala precisa de pelo menos um culto.' })
  @ArrayMaxSize(6, { message: 'No máximo 6 cultos por escala.' })
  @ValidateNested({ each: true })
  @Type(() => EventServiceDto)
  services?: EventServiceDto[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({}, { message: 'Data do ensaio inválida.' })
  rehearsalAt?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string | null;
}

export class ListEventsQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past'], { message: 'Use scope=upcoming ou scope=past.' })
  scope?: 'upcoming' | 'past' = 'upcoming';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class DuplicateEventDto {
  @IsDateString({}, { message: 'Informe a data e hora da nova escala.' })
  startsAt!: string;
}
