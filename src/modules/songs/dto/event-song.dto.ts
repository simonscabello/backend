import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const optionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class SetlistItemDto {
  /// Em qual culto da escala esta musica entra.
  ///
  /// Obrigatorio, e nao opcional com um padrao no servidor: toda escala tem
  /// pelo menos um culto, e um servidor que escolhesse sozinho estaria
  /// adivinhando de manha ou de noite -- justamente a pergunta que esta tela
  /// existe para responder.
  @IsUUID(undefined, { message: 'Culto inválido no repertório.' })
  serviceId!: string;

  @IsUUID(undefined, { message: 'Música inválida no repertório.' })
  songId!: string;

  /// O tom desta escala especifica. Sobrepoe o tom da equipe sem alterar a
  /// musica: a mesma cancao pode subir um tom quando quem canta muda.
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(20)
  keyOverride?: string | null;

  /// Recado para a equipe naquela musica ("entra so o teclado", "repetir o
  /// refrao").
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(280)
  note?: string | null;
}

export class ReplaceSetlistDto {
  /// A lista inteira, na ordem. Substitui o que estava la -- e como a tela
  /// funciona: arrasta, tira, poe e salva de uma vez.
  ///
  /// O teto existe para o corpo da requisicao nao virar um vetor de abuso;
  /// nenhum culto tem 60 musicas.
  @IsArray()
  @ArrayMaxSize(60, { message: 'Repertório longo demais.' })
  @ValidateNested({ each: true })
  @Type(() => SetlistItemDto)
  songs!: SetlistItemDto[];
}
