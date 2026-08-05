### Task 6: Shell de navegaÃ§Ã£o + Agenda

**Files:**
- Create: `app/lib/features/events/presentation/main_shell.dart`
- Create: `app/lib/features/events/presentation/agenda_screen.dart`
- Modify: `app/lib/core/router/app_router.dart`
- Keep: `home_screen.dart` para onboarding sem equipe (embutido na Agenda ou rota `/home` redirecionada)

**Interfaces:**
- Redirect autenticado: `/agenda` (em vez de `/home`)
- BottomNav: Ã­ndice 0 Agenda, 1 Equipe

- [ ] **Step 1: MainShell**

`Scaffold` com `body: child`, `BottomNavigationBar` itens Agenda / Equipe; `onTap` â†’ `context.go('/agenda'|'/equipe')`. Logout no AppBar da Agenda.

- [ ] **Step 2: AgendaScreen**

- Se `auth.teams.isEmpty`: reutilizar UI de onboarding da `HomeScreen` (extrair widget ou navegar conteÃºdo equivalente).
- SenÃ£o: `DefaultTabController` ou SegmentedButton prÃ³ximos/passados; carregar `eventsProvider`.
- Primeiro item upcoming em card de destaque; resto em lista.
- Cada tile: weekday + data + horÃ¡rio culto + ensaio via `event_datetime`.
- FAB `+` se `canManage` â†’ `/agenda/novo`.
- Empty: `Nenhum culto cadastrado. Toque em + para criar o primeiro.`
- Tap item â†’ `/agenda/:eventId`

- [ ] **Step 3: Router**

Usar `ShellRoute` (ou `StatefulShellRoute.indexedStack`):

```dart
ShellRoute(
  builder: (context, state, child) => MainShell(child: child),
  routes: [
    GoRoute(
      path: '/agenda',
      builder: (_, __) => const AgendaScreen(),
      routes: [
        GoRoute(path: 'novo', builder: ... EventFormScreen create),
        GoRoute(path: ':eventId', builder: ... EventDetailScreen,
          routes: [
            GoRoute(path: 'editar', builder: ... EventFormScreen edit),
          ],
        ),
      ],
    ),
    GoRoute(path: '/equipe', ... existing MembersScreen ...),
  ],
)
```

Atualizar redirect autenticado: `return '/agenda'`.  
Manter `/home` â†’ redirect `/agenda` para nÃ£o quebrar links antigos.  
Preservar `/equipe/membros/...`, convites, etc. fora ou dentro do shell conforme jÃ¡ funciona (convites podem ficar sem bottom bar via rotas irmÃ£s).

---
