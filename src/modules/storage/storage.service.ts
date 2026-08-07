import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { env } from '../../config/env';

/// Prefixo publico dos arquivos enviados. Fica fora de /api/v1 porque quem
/// serve e o express (static), nao o roteador do Nest -- ver main.ts.
export const UPLOADS_PREFIX = '/uploads';

/// Pastas usadas dentro de STORAGE_DIR. Uma so por enquanto.
export const AVATARS_FOLDER = 'avatars';

/// 5 MB. O app ja reduz a foto antes de enviar (image_picker com maxWidth e
/// imageQuality), entao este limite so existe para barrar abuso.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

interface ImageKind {
  mime: string;
  extension: string;
  matches: (bytes: Buffer) => boolean;
}

/// Confere a assinatura do arquivo, nao o `mimetype` que o cliente declarou:
/// o cabecalho do multipart e escrito por quem envia e nao prova nada.
const IMAGE_KINDS: ImageKind[] = [
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    extension: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export interface StoredFile {
  /// Caminho relativo a STORAGE_DIR, e o que vai para o banco.
  path: string;
  mime: string;
}

/// Guarda arquivos enviados pelos usuarios em disco.
///
/// O disco precisa ser persistente: no Railway o sistema de arquivos do
/// container e descartado a cada deploy, entao STORAGE_DIR aponta para o
/// caminho de montagem de um Volume. Trocar por S3/R2 depois significa
/// reimplementar `save`/`remove` -- o resto do codigo so conhece o caminho
/// relativo gravado em `users.avatar_path`.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  /// Absoluto: o processo em producao nao roda necessariamente do mesmo cwd.
  readonly root = resolve(env.STORAGE_DIR);

  /// Grava a imagem e devolve o caminho relativo. Lanca 400 se o conteudo nao
  /// for JPEG, PNG ou WebP.
  async saveImage(folder: string, bytes: Buffer): Promise<StoredFile> {
    const kind = IMAGE_KINDS.find((k) => k.matches(bytes));

    if (!kind) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Envie uma imagem JPG, PNG ou WebP.',
      });
    }

    const relative = `${folder}/${randomUUID()}.${kind.extension}`;
    const absolute = join(this.root, relative);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);

    return { path: relative, mime: kind.mime };
  }

  /// Apaga sem reclamar se o arquivo ja nao existe: o registro no banco e a
  /// fonte da verdade, e um arquivo orfao nao pode impedir a troca da foto.
  async remove(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;

    const absolute = this.resolveInsideRoot(relativePath);
    if (!absolute) return;

    try {
      await unlink(absolute);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Falha ao apagar ${relativePath}: ${String(error)}`);
      }
    }
  }

  /// Barra caminho que escape da raiz ("../"). Hoje so recebemos valores que a
  /// propria API gerou, mas apagar arquivo e irreversivel.
  private resolveInsideRoot(relativePath: string): string | null {
    const absolute = resolve(this.root, normalize(relativePath));
    return absolute.startsWith(this.root + sep) ? absolute : null;
  }
}
