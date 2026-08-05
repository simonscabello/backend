# Task 6 review
## Files
agenda_screen.dart event_detail_screen.dart event_form_screen.dart main_shell.dart
## agenda_screen.dart (first 120 lines)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/application/auth_controller.dart';
import '../../team/data/team_repository.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class AgendaScreen extends ConsumerStatefulWidget {
  const AgendaScreen({super.key});

  @override
  ConsumerState<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends ConsumerState<AgendaScreen> {
  String _scope = 'upcoming';

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final teamId = ref.watch(activeTeamIdProvider);

    if (auth.teams.isEmpty || teamId == null) {
      return const _AgendaOnboarding();
    }

    final events = ref.watch(eventsProvider((teamId, _scope)));
    final canManage = auth.teams.first.canManage;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      floatingActionButton: canManage
          ? FloatingActionButton(
              tooltip: 'Criar culto',
              onPressed: () => context.push('/agenda/novo'),
              child: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'upcoming', label: Text('Proximos')),
                ButtonSegment(value: 'past', label: Text('Passados')),
              ],
              selected: {_scope},
              onSelectionChanged: (selection) {
                setState(() => _scope = selection.first);
              },
            ),
          ),
          Expanded(
            child: events.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _EventsErrorState(
                onRetry: () => ref.invalidate(eventsProvider((teamId, _scope))),
              ),
              data: (events) => _EventsList(
                events: events,
                showFeaturedEvent: _scope == 'upcoming',
                onRefresh: () =>
                    ref.refresh(eventsProvider((teamId, _scope)).future),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AgendaOnboarding extends ConsumerWidget {
  const _AgendaOnboarding();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(authControllerProvider.notifier).reloadTeams(),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Ola, ${user?.firstName ?? ''}',
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 32),
            const _OnboardingCards(),
          ],
        ),
      ),
## main_shell.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isAgenda = GoRouterState.of(context).uri.path.startsWith('/agenda');

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: isAgenda ? 0 : 1,
        onDestinationSelected: (index) {
          if (index == 0) {
            context.go('/agenda');
            return;
          }

          context.go('/equipe');
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Agenda',
          ),
          NavigationDestination(
            icon: Icon(Icons.groups_outlined),
            selectedIcon: Icon(Icons.groups),
            label: 'Equipe',
          ),
        ],
      ),
    );
  }
}

## app_router.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/change_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/events/presentation/agenda_screen.dart';
import '../../features/events/presentation/event_detail_screen.dart';
import '../../features/events/presentation/event_form_screen.dart';
import '../../features/events/presentation/main_shell.dart';
import '../../features/health/presentation/health_screen.dart';
import '../../features/invites/presentation/invites_screen.dart';
import '../../features/invites/presentation/join_team_screen.dart';
import '../../features/team/data/team_repository.dart';
import '../../features/team/domain/team_models.dart';
import '../../features/team/presentation/create_team_screen.dart';
import '../../features/team/presentation/member_form_screen.dart';
import '../../features/team/presentation/members_screen.dart';

/// Rotas acessiveis sem sessao.
const _publicRoutes = {'/login', '/cadastro', '/diagnostico'};

/// Enquanto a senha nao for trocada, so estas rotas respondem -- espelha o que
/// o backend permite via @SkipPasswordChangeCheck.
const _passwordChangeRoutes = {'/trocar-senha', '/diagnostico'};

/// Faz o go_router reavaliar o redirect sempre que o estado de auth muda.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _subscription = ref.listen<AuthState>(
      authControllerProvider,
      (_, __) => notifyListeners(),
    );
  }

  late final ProviderSubscription<AuthState> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(authControllerProvider).status;
      final location = state.matchedLocation;

      switch (status) {
        case AuthStatus.unknown:
          return location == '/' ? null : '/';

        case AuthStatus.unauthenticated:
          return _publicRoutes.contains(location) ? null : '/login';

        case AuthStatus.mustChangePassword:
          return _passwordChangeRoutes.contains(location)
              ? null
              : '/trocar-senha';

        case AuthStatus.authenticated:
          final isEntryRoute = location == '/' ||
              _publicRoutes.contains(location) ||
              location == '/trocar-senha';
          if (isEntryRoute && location != '/diagnostico') {
            return '/agenda';
          }
          return null;
      }
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/cadastro', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/trocar-senha',
        builder: (_, __) => const ChangePasswordScreen(),
      ),
      GoRoute(path: '/home', redirect: (_, __) => '/agenda'),
      GoRoute(path: '/diagnostico', builder: (_, __) => const HealthScreen()),
      GoRoute(
        path: '/equipe/nova',
        builder: (_, __) => const CreateTeamScreen(),
      ),
      GoRoute(path: '/convite', builder: (_, __) => const JoinTeamScreen()),
      GoRoute(
        path: '/equipe/convites',
        builder: (_, __) =>
            _withActiveTeam(ref, (id) => InvitesScreen(teamId: id)),
      ),
      ShellRoute(
        builder: (_, __, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/agenda',
            builder: (_, __) => const AgendaScreen(),
            routes: [
              GoRoute(
                path: 'novo',
                builder: (_, __) => const EventFormScreen(),
              ),
              GoRoute(
                path: ':eventId',
                builder: (_, state) => EventDetailScreen(
                  eventId: state.pathParameters['eventId']!,
                ),
                routes: [
                  GoRoute(
                    path: 'editar',
                    builder: (_, state) => EventFormScreen(
                      eventId: state.pathParameters['eventId'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/equipe',
            builder: (_, __) =>
                _withActiveTeam(ref, (id) => MembersScreen(teamId: id)),
            routes: [
              GoRoute(
                path: 'membros/novo',
                builder: (_, __) =>
                    _withActiveTeam(ref, (id) => MemberFormScreen(teamId: id)),
              ),
              GoRoute(
                path: 'membros/editar',
                builder: (_, state) => _withActiveTeam(
                  ref,
                  (id) => MemberFormScreen(
                    teamId: id,
                    member: state.extra as Member?,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

/// As telas de equipe dependem da equipe ativa. Se ela ainda nao carregou,
/// mostramos um aviso em vez de quebrar a navegacao.
Widget _withActiveTeam(Ref ref, Widget Function(String teamId) build) {
  final teamId = ref.read(activeTeamIdProvider);

  if (teamId == null) {
    return const Scaffold(
      body: Center(child: Text('Voce ainda nao faz parte de uma equipe.')),
    );
  }

  return build(teamId);
}

