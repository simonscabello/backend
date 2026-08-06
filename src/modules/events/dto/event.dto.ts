import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o título da escala.' })
  @MaxLength(200)
  title!: string;

  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt!: string;

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
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o título da escala.' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt?: string;

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
