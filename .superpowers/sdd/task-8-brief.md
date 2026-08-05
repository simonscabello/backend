### Task 8: VerificaÃ§Ã£o final

- [ ] **Step 1: Backend**

```
docker compose exec api npx tsc --noEmit -p tsconfig.json
```
Repetir curls da Task 3 se ainda nÃ£o rodaram nesta sessÃ£o; colar saÃ­das.

- [ ] **Step 2: App**

```
$env:PATH = 'C:\Users\Acer\flutter\bin;' + $env:PATH
cd app
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:3000
```
Expected: analyze "No issues found!"; tests pass; APK gera.

- [ ] **Step 3: RelatÃ³rio**

Listar o que passou e o que **nÃ£o** foi verificado (ex.: UI no emulador, conta MEMBER se nÃ£o houver).

---

## Self-review (plano vs spec)

| Spec | Task |
|---|---|
| Guard estendido teamId/eventId + 404 | Task 1 |
| CRUD rotas mistas | Tasks 2â€“3 |
| scope/limit, ordenaÃ§Ã£o | Task 2 |
| REHEARSAL_AFTER_START no service | Task 2 |
| status PUBLISHED, sem duplicate | Task 2 |
| assignments/songs [] | Task 2 |
| Agenda + BottomNav + form + detalhe | Tasks 6â€“7 |
| FormataÃ§Ã£o pt_BR + testes | Task 4 |
| curl + analyze + test + APK | Tasks 3, 8 |

Sem placeholders TBD. `UpdateEventDto.rehearsalAt: null` limpa ensaio â€” comportamento explÃ­cito.
