### Task 1: Estender TeamMemberGuard

**Files:**
- Modify: `backend/src/common/guards/team-member.guard.ts`

**Interfaces:**
- Consumes: `request.params.teamId` ou `request.params.eventId`
- Produces: `request.membership` (Membership ACTIVE) ou 404

- [ ] **Step 1: Substituir a resoluÃ§Ã£o de teamId**

No `canActivate`, apÃ³s obter `user`, substituir o bloco que exige sÃ³ `teamId` por:

```typescript
const rawTeamId = request.params?.teamId;
const rawEventId = request.params?.eventId;
let teamId = typeof rawTeamId === 'string' ? rawTeamId : undefined;

// Rotas /events/:eventId nao trazem teamId; resolvemos pelo evento.
// Quem nao e membro da equipe dona do evento recebe 404 (mesmo contrato).
if (!teamId && typeof rawEventId === 'string') {
  const event = await this.prisma.event.findUnique({
    where: { id: rawEventId },
    select: { teamId: true },
  });
  if (!event) {
    throw new NotFoundException('Culto nao encontrado.');
  }
  teamId = event.teamId;
}

if (!teamId) {
  throw new InternalServerErrorException(
    'Rota protegida pelo TeamMemberGuard sem parametro :teamId ou :eventId.',
  );
}
```

Manter o restante (lookup membership ACTIVE, 404 se ausente, `@TeamRoles`) igual.

- [ ] **Step 2: Typecheck**

Run: `docker compose exec api npx tsc --noEmit -p tsconfig.json`  
Expected: sem erros.

---
