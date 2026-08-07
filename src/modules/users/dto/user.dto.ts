import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Os dois campos sao opcionais: a tela envia so o que mudou.
export class UpdateMeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe seu nome.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email?: string;
}
