import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
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
}

/// Corpo do POST /songs/from-catalog: a musica de outra equipe que serve de
/// origem. Vem do `sourceSongId` que a busca do catalogo devolveu.
export class CopyFromCatalogDto {
  @IsUUID(undefined, { message: 'Música de origem inválida.' })
  sourceSongId!: string;
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
