import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// O fuso da equipe nao e configuravel: e sempre America/Sao_Paulo, o padrao
/// da coluna `teams.timezone`. A coluna continua existindo porque e de onde
/// toda conversao de horario le -- espalhar a string pelo codigo seria pior --,
/// mas nenhuma rota aceita altera-la.
export class CreateTeamDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da equipe.' })
  @MaxLength(120)
  name!: string;

  /// Como o criador aparece na equipe. Sem isto, usamos o nome da conta.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;
}

export class UpdateTeamDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}
