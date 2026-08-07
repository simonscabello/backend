import { BadRequestException } from '@nestjs/common';
import type { EventServiceDto } from './dto/event.dto';

/// Linha de culto como vem do banco.
export type ServiceRow = {
  id: string;
  label: string;
  startsAt: Date;
  sortOrder: number;
};

/// Culto pronto para gravar, com a ordem já resolvida.
///
/// O `id` só existe quando o cliente está editando um culto que já estava
/// gravado; em escala nova, e em culto acrescentado numa edição, ele é
/// `undefined` e o banco gera o próprio. Deixá-lo `undefined` (e não `null`)
/// é o que permite passar o objeto direto para o `create` do Prisma.
export type ServiceInput = {
  id?: string;
  label: string;
  startsAt: Date;
  sortOrder: number;
  templateId: string | null;
};

/// Transforma o que veio no corpo da requisição na lista de cultos da escala.
///
/// Os cultos saem ordenados por horário, e `sortOrder` recebe o índice: quem
/// monta a escala marca "Noite" antes de "Manhã" sem pensar, e a tela não
/// deveria refletir a ordem de digitação.
export function normalizeServices(
  services: EventServiceDto[],
): ServiceInput[] {
  const raw = services.map((s) => ({
    id: s.id,
    label: s.label,
    startsAt: new Date(s.startsAt),
    templateId: s.templateId ?? null,
  }));

  for (const service of raw) {
    if (Number.isNaN(service.startsAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE_TIME',
        message: 'Informe a data e hora de cada culto.',
      });
    }
  }

  // Dois cultos no mesmo instante são erro de digitação, não um caso de uso:
  // ninguém tem dois cultos simultâneos com a mesma equipe.
  const instants = new Set(raw.map((s) => s.startsAt.getTime()));
  if (instants.size !== raw.length) {
    throw new BadRequestException({
      code: 'DUPLICATE_SERVICE_TIME',
      message: 'Dois cultos da mesma escala não podem ter o mesmo horário.',
    });
  }

  // O mesmo id duas vezes faria dois cultos da lista disputarem a mesma linha:
  // o segundo sobrescreveria o primeiro e um deles sumiria sem erro nenhum.
  const ids = raw.map((s) => s.id).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      code: 'DUPLICATE_SERVICE_ID',
      message: 'O mesmo culto aparece duas vezes na escala.',
    });
  }

  return raw
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((service, index) => ({ ...service, sortOrder: index }));
}

export function toPublicServices(services: ServiceRow[]) {
  return [...services]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((service) => ({
      id: service.id,
      label: service.label,
      startsAt: service.startsAt.toISOString(),
    }));
}
