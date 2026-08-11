import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SongKind, SongPace } from '@prisma/client';

/// Campo de texto opcional: string vazia vira null, para o banco nao guardar
/// "" e "" nao competir com null na hora de perguntar "tem artista?".
const optionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class SongFieldsDto {
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(160)
  artist?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(160)
  composer?: string | null;

  @IsOptional()
  @IsEnum(SongKind, { message: 'Informe se é hino ou cântico.' })
  kind?: SongKind | null;

  @IsOptional()
  @IsEnum(SongPace, { message: 'Andamento inválido.' })
  pace?: SongPace | null;

  /// Texto livre e curto: cabe "C", "Bm" e "G (capo 2)".
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(20)
  defaultKey?: string | null;

  /// Tom da GRAVACAO. Continua sendo sugestao, nao decisao -- `defaultKey` e o
  /// que a equipe canta. Editavel porque o enriquecimento le do CifraClub e
  /// as vezes nao acha a pagina, ou acha a de outra versao: sem isto o unico
  /// jeito de corrigir seria mexer no banco.
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(20)
  originalKey?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(20_000)
  lyrics?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({}, { message: 'Link da letra inválido.' })
  @MaxLength(500)
  lyricsUrl?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({}, { message: 'Link da cifra inválido.' })
  @MaxLength(500)
  chordsUrl?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({}, { message: 'Link do YouTube inválido.' })
  @MaxLength(500)
  youtubeUrl?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({}, { message: 'Link do Spotify inválido.' })
  @MaxLength(500)
  spotifyUrl?: string | null;

  /// A equipe ainda esta aprendendo esta musica.
  ///
  /// Estado do repertorio: ligado quando entra, desligado quando a equipe
  /// domina e a igreja ja canta junto. Nenhuma consulta responde isso -- quem
  /// responde e quem esta la no domingo.
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  /// Numero do hino no Cantor Cristao. Nulo em cantico.
  ///
  /// O teto e 581 porque o hinario acaba ali: numero fora da faixa e digitacao
  /// errada, e gravado ele mandaria a busca por "600" a lugar nenhum.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Número do hino inválido.' })
  @Min(1, { message: 'O hino começa em 1.' })
  @Max(581, { message: 'O Cantor Cristão vai até 581.' })
  hymnNumber?: number | null;
}

/// Corpo do POST /songs/from-catalog: a musica de outra equipe que serve de
/// origem. Vem do `sourceSongId` que a busca do catalogo devolveu.
export class CopyFromCatalogDto {
  @IsUUID(undefined, { message: 'Música de origem inválida.' })
  sourceSongId!: string;

  /// Se a equipe vai aprende-la agora. Vem da tela de adicionar, e nao da
  /// musica de origem: que ELES ja dominem a cancao nao diz nada sobre a SUA
  /// equipe.
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;
}

/// Corpo do POST /songs/from-external: a musica escolhida na busca externa.
/// O cliente devolve o que a busca entregou -- assim o servidor nao precisa
/// guardar estado entre a busca e a escolha.
export class CreateFromExternalDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da música.' })
  @MaxLength(200)
  title!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o artista.' })
  @MaxLength(160)
  artist!: string;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({}, { message: 'Link do Spotify inválido.' })
  @MaxLength(500)
  spotifyUrl?: string | null;

  /// Se a equipe vai aprende-la agora.
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;
}

export class CreateSongDto extends SongFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da música.' })
  @MaxLength(200)
  title!: string;
}

export class UpdateSongDto extends SongFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da música.' })
  @MaxLength(200)
  title?: string;

  /// Arquivar e o caminho para tirar do repertorio uma musica ja usada em
  /// alguma escala (regra 21).
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
