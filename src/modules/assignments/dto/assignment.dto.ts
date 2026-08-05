import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
}
