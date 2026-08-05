# Task 7
## event_form_screen.dart
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/form_scaffold.dart';
import '../../team/data/team_repository.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class EventFormScreen extends ConsumerStatefulWidget {
  const EventFormScreen({super.key, this.eventId});

  final String? eventId;

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _location = TextEditingController();
  final _notes = TextEditingController();
  final _colorPalette = TextEditingController();

  late DateTime _startsAt;
  DateTime? _rehearsalAt;
  bool _populated = false;
  bool _loading = false;
  String? _error;

  bool get _isEditing => widget.eventId != null;

  @override
  void initState() {
    super.initState();
    _startsAt = DateTime.now();
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _notes.dispose();
    _colorPalette.dispose();
    super.dispose();
  }

  void _populate(Event event) {
    if (_populated) return;

    _populated = true;
    _title.text = event.title;
    _location.text = event.location ?? '';
    _notes.text = event.notes ?? '';
    _colorPalette.text = event.colorPalette ?? '';
    _startsAt = eventLocalTime(event.startsAt, _timezone(event.timezone));
    _rehearsalAt = event.rehearsalAt == null
        ? null
        : eventLocalTime(event.rehearsalAt!, _timezone(event.timezone));
  }

  String _timezone(String value) {
    if (value.isEmpty) return 'America/Sao_Paulo';
    return value;
  }

  Future<void> _pickDate({required bool rehearsal}) async {
    final current = rehearsal ? _rehearsalAt ?? _startsAt : _startsAt;
    final selected = await showDatePicker(
      context: context,
      locale: const Locale('pt', 'BR'),
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) return;

    setState(() {
      final updated = DateTime(
        selected.year,
        selected.month,
        selected.day,
        current.hour,
        current.minute,
      );
      if (rehearsal) {
        _rehearsalAt = updated;
        return;
      }
      _startsAt = updated;
    });
  }

  Future<void> _pickTime({required bool rehearsal}) async {
    final current = rehearsal ? _rehearsalAt ?? _startsAt : _startsAt;
    final selected = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (selected == null || !mounted) return;

    setState(() {
      final updated = DateTime(
        current.year,
        current.month,
        current.day,
        selected.hour,
        selected.minute,
      );
      if (rehearsal) {
        _rehearsalAt = updated;
        return;
      }
      _startsAt = updated;
    });
  }

  DateTime _toUtc(DateTime dateTime, String timezone) {
    final location = tz.getLocation(timezone);
    return tz.TZDateTime(
      location,
      dateTime.year,
      dateTime.month,
      dateTime.day,
      dateTime.hour,
      dateTime.minute,
    ).toUtc();
  }

  Future<String> _createTimezone(String teamId) async {
    final team = await ref.read(teamRepositoryProvider).find(teamId);
    return _timezone(team.timezone);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final activeTeamId = ref.read(activeTeamIdProvider);
    if (!_isEditing && activeTeamId == null) {
      setState(() => _error = 'Nenhuma equipe ativa foi encontrada.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final event = _isEditing
          ? await ref.read(eventRepositoryProvider).find(widget.eventId!)
          : null;
      final timezone = event == null
          ? await _createTimezone(activeTeamId!)
          : _timezone(event.timezone);
      final startsAt = _toUtc(_startsAt, timezone).toIso8601String();
      final rehearsalAt = _rehearsalAt == null
          ? null
          : _toUtc(_rehearsalAt!, timezone).toIso8601String();
      final repository = ref.read(eventRepositoryProvider);

      if (event != null) {
        await repository.update(
          event.id,
          title: _title.text.trim(),
          startsAt: startsAt,
          rehearsalAt: rehearsalAt,
          removeRehearsalAt: _rehearsalAt == null,
          location: _location.text.trim(),
          notes: _notes.text.trim(),
          colorPalette: _colorPalette.text.trim(),
        );
        ref.invalidate(eventsProvider((event.teamId, 'upcoming')));
        ref.invalidate(eventsProvider((event.teamId, 'past')));
        ref.invalidate(eventProvider(event.id));
      } else {
        final createdEvent = await repository.create(
          activeTeamId!,
          title: _title.text.trim(),
          startsAt: startsAt,
          rehearsalAt: rehearsalAt,
          location: _location.text.trim(),
          notes: _notes.text.trim(),
          colorPalette: _colorPalette.text.trim(),
        );
        ref.invalidate(eventsProvider((createdEvent.teamId, 'upcoming')));
        ref.invalidate(eventsProvider((createdEvent.teamId, 'past')));
        ref.invalidate(eventProvider(createdEvent.id));
      }

      if (mounted) context.pop();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eventAsync = _isEditing ? ref.watch(eventProvider(widget.eventId!)) : null;

    if (eventAsync != null && eventAsync.isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (eventAsync != null && eventAsync.hasError) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => ref.invalidate(eventProvider(widget.eventId!)),
            child: const Text('Tentar novamente'),
          ),
        ),
      );
    }

    final event = eventAsync?.valueOrNull;
    if (event != null) _populate(event);

    return FormScaffold(
      appBar: AppBar(),
      title: _isEditing ? 'Editar culto' : 'Novo culto',
      subtitle: 'Informe os horarios e os detalhes do culto.',
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _title,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Titulo do culto'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Informe o titulo do culto.'
                    : null,
              ),
              const SizedBox(height: 24),
              Text('Culto', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              _DateTimeFields(
                dateTime: _startsAt,
                enabled: !_loading,
                onPickDate: () => _pickDate(rehearsal: false),
                onPickTime: () => _pickTime(rehearsal: false),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Ensaio (opcional)',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (_rehearsalAt != null)
                    IconButton(
                      tooltip: 'Limpar ensaio',
                      onPressed: _loading
                          ? null
                          : () => setState(() => _rehearsalAt = null),
                      icon: const Icon(Icons.clear),
                    ),
                ],
              ),
              if (_rehearsalAt == null)
                OutlinedButton.icon(
                  onPressed: _loading
                      ? null
                      : () => setState(() => _rehearsalAt = _startsAt),
                  icon: const Icon(Icons.add),
                  label: const Text('Adicionar ensaio'),
                )
              else
                _DateTimeFields(
                  dateTime: _rehearsalAt!,
                  enabled: !_loading,
                  onPickDate: () => _pickDate(rehearsal: true),
                  onPickTime: () => _pickTime(rehearsal: true),
                ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _location,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Local (opcional)'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _notes,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Observacoes (opcional)'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _colorPalette,
                enabled: !_loading,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Paleta de cores (opcional)',
                  hintText: 'Preto e dourado',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        if (_error != null) FormErrorBanner(message: _error!),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(_isEditing ? 'Salvar' : 'Criar culto'),
        ),
      ],
    );
  }
}

class _DateTimeFields extends StatelessWidget {
  const _DateTimeFields({
    required this.dateTime,
    required this.enabled,
    required this.onPickDate,
    required this.onPickTime,
  });

  final DateTime dateTime;
  final bool enabled;
  final VoidCallback onPickDate;
  final VoidCallback onPickTime;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: enabled ? onPickDate : null,
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text(DateFormat('dd/MM/yyyy', 'pt_BR').format(dateTime)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: enabled ? onPickTime : null,
            icon: const Icon(Icons.schedule_outlined),
            label: Text(DateFormat('HH:mm', 'pt_BR').format(dateTime)),
          ),
        ),
      ],
    );
  }
}

```
## event_detail_screen.dart
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../data/event_repository.dart';
import '../domain/event_datetime.dart';
import '../domain/event_models.dart';

class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventAsync = ref.watch(eventProvider(eventId));
    final canManage = ref.watch(authControllerProvider).teams.firstOrNull?.canManage ?? false;

    return eventAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => ref.invalidate(eventProvider(eventId)),
            child: const Text('Tentar novamente'),
          ),
        ),
      ),
      data: (event) => Scaffold(
        appBar: AppBar(
          title: const Text('Culto'),
          actions: [
            if (canManage)
              IconButton(
                tooltip: 'Editar culto',
                onPressed: () => context.push('/agenda/${event.id}/editar'),
                icon: const Icon(Icons.edit_outlined),
              ),
            if (canManage)
              IconButton(
                tooltip: 'Excluir culto',
                onPressed: () => _confirmDelete(context, ref, event),
                icon: const Icon(Icons.delete_outline),
              ),
          ],
        ),
        body: _EventDetailBody(event: event),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Event event,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Excluir culto?'),
        content: Text('O culto "${event.title}" sera removido.'),
        actions: [
          TextButton(
            onPressed: () => dialogContext.pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => dialogContext.pop(true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(eventRepositoryProvider).remove(event.id);
      ref.invalidate(eventsProvider((event.teamId, 'upcoming')));
      ref.invalidate(eventsProvider((event.teamId, 'past')));
      ref.invalidate(eventProvider(event.id));
      if (context.mounted) context.pop();
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }
}

class _EventDetailBody extends StatelessWidget {
  const _EventDetailBody({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    final timezone =
        event.timezone.isEmpty ? 'America/Sao_Paulo' : event.timezone;
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
      children: [
        Text(event.title, style: theme.textTheme.headlineMedium),
        const SizedBox(height: 24),
        _DetailItem(
          icon: Icons.calendar_today_outlined,
          label: 'Culto',
          value:
              '${formatEventWeekdayDate(event.startsAt, timezone)} Ã s ${formatEventTime(event.startsAt, timezone)}',
        ),
        if (event.rehearsalAt != null) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.schedule_outlined,
            label: 'Ensaio',
            value:
                '${formatEventWeekdayDate(event.rehearsalAt!, timezone)} Ã s ${formatEventTime(event.rehearsalAt!, timezone)}',
          ),
        ],
        if (event.location?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.location_on_outlined,
            label: 'Local',
            value: event.location!,
          ),
        ],
        if (event.notes?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.notes_outlined,
            label: 'Observacoes',
            value: event.notes!,
          ),
        ],
        if (event.colorPalette?.isNotEmpty ?? false) ...[
          const SizedBox(height: 16),
          _DetailItem(
            icon: Icons.palette_outlined,
            label: 'Paleta',
            value: event.colorPalette!,
          ),
        ],
        const SizedBox(height: 32),
        const _ComingSoonSection(
          icon: Icons.groups_outlined,
          title: 'Equipe escalada â€” em breve',
        ),
        const SizedBox(height: 16),
        const _ComingSoonSection(
          icon: Icons.music_note_outlined,
          title: 'Musicas â€” em breve',
        ),
      ],
    );
  }
}

class _DetailItem extends StatelessWidget {
  const _DetailItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 2),
              Text(value, style: Theme.of(context).textTheme.bodyLarge),
            ],
          ),
        ),
      ],
    );
  }
}

class _ComingSoonSection extends StatelessWidget {
  const _ComingSoonSection({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
      ),
    );
  }
}

```
