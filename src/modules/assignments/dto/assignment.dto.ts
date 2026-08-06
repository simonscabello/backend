import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class AssignmentItemDto {
  @IsUUID('4', { message: 'membershipId inválido.' })
  membershipId!: string;

  @IsUUID('4', { message: 'positionId inválido.' })
  positionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReplaceAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  @ArrayUnique(
    (item: AssignmentItemDto) => `${item.membershipId}:${item.positionId}`,
    { message: 'Não repita o mesmo membro na mesma função.' },
  )
  assignments!: AssignmentItemDto[];

  /// Quem conduz a ministracao do louvor nesta escala. `null` limpa.
  ///
  /// Vem junto da escalacao, e nao num PATCH separado, porque precisa ser um
  /// dos escalados -- salvar as duas coisas na mesma transacao e o que impede
  /// o ministrante de sobrar apontando para quem saiu da escala.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'ministerMembershipId inválido.' })
  ministerMembershipId?: string | null;
}
