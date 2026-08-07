import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/// Global porque qualquer modulo que passe a aceitar arquivo (repertorio com
/// PDF de cifra, por exemplo) vai precisar dele sem cerimonia.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
