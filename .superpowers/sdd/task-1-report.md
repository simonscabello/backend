# Task 1 Report: Estender TeamMemberGuard

**Status:** DONE  
**Date:** 2026-08-05  
**Scope:** `backend/src/common/guards/team-member.guard.ts` only

## What changed

Replaced the single-parameter `:teamId` resolution in `canActivate` with a two-path resolver:

1. **Primary:** read `request.params.teamId` (unchanged behavior for existing routes).
2. **Fallback:** when `teamId` is absent but `request.params.eventId` is present, look up `event.teamId` via Prisma.
3. **Missing event:** `NotFoundException('Culto nao encontrado.')` — 404 before membership check.
4. **Neither param:** `InternalServerErrorException` with updated message mentioning both `:teamId` and `:eventId`.

Membership lookup, 404 for non-members, `@TeamRoles` enforcement, and `request.membership` injection were left unchanged.

## Code diff summary

| Before | After |
|--------|-------|
| Required `:teamId` only | Accepts `:teamId` or `:eventId` |
| 500 if no `teamId` | Resolves `teamId` from event when only `eventId` present |
| — | 404 if event does not exist |

## Verification

### Typecheck

```bash
docker compose exec api npx tsc --noEmit -p tsconfig.json
```

**Result:** exit code 0, no errors.

### Runtime / curl

Not exercised in this task — no routes using `:eventId` without `:teamId` exist yet (events module is a later task). Behavior will be validated when those routes are added.

## Self-review

| Requirement | Met? | Notes |
|-------------|------|-------|
| Only modify `team-member.guard.ts` | Yes | Single file changed |
| Non-member → 404 | Yes | Unchanged; still `NotFoundException('Equipe nao encontrada.')` |
| Event not found → 404 | Yes | `NotFoundException('Culto nao encontrado.')` |
| `@TeamRoles` unchanged | Yes | Same reflector logic after membership resolved |
| Exact code from brief | Yes | Block matches task brief verbatim |
| No git commits | Yes | N/A per instructions |

## Concerns

None blocking. Minor notes for downstream tasks:

- When both `:teamId` and `:eventId` are present, `:teamId` wins (brief does not require cross-validation that the event belongs to that team; future routes should avoid supplying conflicting params).
- Extra DB round-trip on event-only routes (one `findUnique` before membership lookup) — acceptable for MVP.

## Files touched

- `backend/src/common/guards/team-member.guard.ts` — modified
