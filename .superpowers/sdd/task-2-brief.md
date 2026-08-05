### Task 2: DTOs e EventsService

**Files:**
- Create: `backend/src/modules/events/dto/event.dto.ts`
- Create: `backend/src/modules/events/events.service.ts`

**Interfaces:**
- Produces:
  - `EventsService.create(teamId, membershipId, dto) â†’ public event`
  - `list(teamId, scope, limit) â†’ public event[]`
  - `findOne(eventId) â†’ public event + assignments: [] + songs: [] + timezone`
  - `update(eventId, dto)`, `remove(eventId)`

- [ ] **Step 1: Criar DTOs**

```typescript
// backend/src/modules/events/dto/event.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o titulo do culto.' })
  @MaxLength(200)
  title!: string;

  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt!: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data do ensaio invalida.' })
  rehearsalAt?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string;
}

export class UpdateEventDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o titulo do culto.' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Informe a data e hora do culto.' })
  startsAt?: string;

  /// null limpa o ensaio; omitido nao altera. Usar @ValidateIf para aceitar null.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({}, { message: 'Data do ensaio invalida.' })
  rehearsalAt?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  colorPalette?: string | null;
}

export class ListEventsQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past'], { message: 'Use scope=upcoming ou scope=past.' })
  scope?: 'upcoming' | 'past' = 'upcoming';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

Nota: se `scope` com default via propriedade falhar no ValidationPipe, aplicar default no service (`dto.scope ?? 'upcoming'`).

- [ ] **Step 2: Criar EventsService**

Implementar:

```typescript
// Esqueleto â€” completar no arquivo
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRehearsal(startsAt: Date, rehearsalAt?: Date | null) {
    if (rehearsalAt && rehearsalAt > startsAt) {
      throw new BadRequestException({
        code: 'REHEARSAL_AFTER_START',
        message: 'O ensaio precisa ser antes ou no mesmo horario do culto.',
      });
    }
  }

  private toPublic(event: Event & { team?: { timezone: string } }) {
    return {
      id: event.id,
      teamId: event.teamId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      rehearsalAt: event.rehearsalAt?.toISOString() ?? null,
      location: event.location,
      notes: event.notes,
      colorPalette: event.colorPalette,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      timezone: event.team?.timezone,
      assignments: [] as const,
      songs: [] as const,
    };
  }

  async create(teamId: string, createdById: string, dto: CreateEventDto) {
    const startsAt = new Date(dto.startsAt);
    const rehearsalAt = dto.rehearsalAt ? new Date(dto.rehearsalAt) : null;
    this.assertRehearsal(startsAt, rehearsalAt);

    const event = await this.prisma.event.create({
      data: {
        teamId,
        createdById,
        title: dto.title,
        startsAt,
        rehearsalAt,
        location: dto.location,
        notes: dto.notes,
        colorPalette: dto.colorPalette,
        status: 'PUBLISHED',
      },
      include: { team: { select: { timezone: true } } },
    });
    return this.toPublic(event);
  }

  async list(teamId: string, scope: 'upcoming' | 'past', limit: number) {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        teamId,
        startsAt: scope === 'upcoming' ? { gte: now } : { lt: now },
      },
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
      include: { team: { select: { timezone: true } } },
    });
    return events.map((e) => this.toPublic(e));
  }

  async findOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { team: { select: { timezone: true } } },
    });
    if (!event) {
      throw new NotFoundException('Culto nao encontrado.');
    }
    return this.toPublic(event);
  }

  async update(eventId: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!existing) {
      throw new NotFoundException('Culto nao encontrado.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const rehearsalAt =
      dto.rehearsalAt === undefined
        ? existing.rehearsalAt
        : dto.rehearsalAt === null
          ? null
          : new Date(dto.rehearsalAt);
    this.assertRehearsal(startsAt, rehearsalAt);

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startsAt !== undefined ? { startsAt } : {}),
        ...(dto.rehearsalAt !== undefined ? { rehearsalAt } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.colorPalette !== undefined
          ? { colorPalette: dto.colorPalette }
          : {}),
      },
      include: { team: { select: { timezone: true } } },
    });
    return this.toPublic(event);
  }

  async remove(eventId: string) {
    try {
      await this.prisma.event.delete({ where: { id: eventId } });
    } catch {
      throw new NotFoundException('Culto nao encontrado.');
    }
  }
}
```

Usar early return / guard clauses; evitar `else` apÃ³s `return` (convenÃ§Ã£o do projeto).

- [ ] **Step 3: Typecheck**

Run: `docker compose exec api npx tsc --noEmit -p tsconfig.json`  
Expected: sem erros (mÃ³dulo ainda nÃ£o registrado â€” ok se sÃ³ estes arquivos compilam no projeto inteiro; se faltarem imports de controller, completar Task 3 antes).

---
