import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { MAX_UPLOAD_BYTES } from '../storage/storage.service';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/user.dto';

/// O que o multer entrega em memoria. Declarado aqui para o projeto nao
/// precisar de @types/multer so por causa de tres campos.
interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

/// Cada um cuida da propria conta: todas as rotas agem sobre o usuario do
/// token, sem `:id` no caminho. Trocar a senha continua em /auth.
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  /// multipart/form-data, campo `file`. Passar do limite devolve 413 (o
  /// proprio @nestjs/platform-express converte o erro do multer).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedImage,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Nenhuma imagem foi enviada.',
      });
    }

    return this.users.setAvatar(user.id, file.buffer);
  }

  @HttpCode(HttpStatus.OK)
  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.users.removeAvatar(user.id);
  }
}
