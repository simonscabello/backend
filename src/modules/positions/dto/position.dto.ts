import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PositionCategory } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePositionDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da função.' })
  @MaxLength(60)
  name!: string;

  @IsEnum(PositionCategory, {
    message: 'Categoria deve ser VOCAL, INSTRUMENT, TECH ou OTHER.',
  })
  category!: PositionCategory;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePositionDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsEnum(PositionCategory)
  category?: PositionCategory;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
