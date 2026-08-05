# Review package — Task 4

## event_models.dart
```dart
class Event {
  const Event({
    required this.id,
    required this.teamId,
    required this.title,
    required this.startsAt,
    required this.rehearsalAt,
    required this.location,
    required this.notes,
    required this.colorPalette,
    required this.status,
    required this.timezone,
    required this.assignments,
    required this.songs,
  });

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'] as String,
      teamId: json['teamId'] as String,
      title: json['title'] as String,
      startsAt: DateTime.parse(json['startsAt'] as String).toUtc(),
      rehearsalAt: _parseUtcDateTime(json['rehearsalAt']),
      location: json['location'] as String?,
      notes: json['notes'] as String?,
      colorPalette: json['colorPalette'] as String?,
      status: json['status'] as String,
      timezone: json['timezone'] as String,
      assignments:
          (json['assignments'] as List<dynamic>? ?? const []).cast<Object?>(),
      songs: (json['songs'] as List<dynamic>? ?? const []).cast<Object?>(),
    );
  }

  final String id;
  final String teamId;
  final String title;
  final DateTime startsAt;
  final DateTime? rehearsalAt;
  final String? location;
  final String? notes;
  final String? colorPalette;
  final String status;
  final String timezone;
  final List<Object?> assignments;
  final List<Object?> songs;

  static DateTime? _parseUtcDateTime(Object? value) {
    if (value == null) {
      return null;
    }

    return DateTime.parse(value as String).toUtc();
  }
}

```

## event_datetime.dart
```dart
import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

DateTime eventLocalTime(DateTime utc, String timezone) {
  return tz.TZDateTime.from(utc, tz.getLocation(timezone));
}

String formatEventWeekdayDate(DateTime utc, String timezone) {
  final localTime = eventLocalTime(utc, timezone);
  return DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(localTime);
}

String formatEventTime(DateTime utc, String timezone) {
  final localTime = eventLocalTime(utc, timezone);
  return DateFormat('HH:mm', 'pt_BR').format(localTime);
}

```

## event_datetime_test.dart
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:louvor_app/features/events/domain/event_datetime.dart';
import 'package:louvor_app/features/events/domain/event_models.dart';
import 'package:timezone/data/latest.dart' as tzdata;

void main() {
  setUpAll(() async {
    tzdata.initializeTimeZones();
    await initializeDateFormatting('pt_BR');
  });

  test('fromJson mapeia datas ISO UTC', () {
    final event = Event.fromJson({
      'id': 'e1',
      'teamId': 't1',
      'title': 'Culto',
      'startsAt': '2026-08-09T12:00:00.000Z',
      'rehearsalAt': '2026-08-08T22:00:00.000Z',
      'location': null,
      'notes': 'Chegar cedo',
      'colorPalette': 'Preto e dourado',
      'status': 'PUBLISHED',
      'timezone': 'America/Sao_Paulo',
      'assignments': [],
      'songs': [],
    });

    expect(event.startsAt.isUtc, isTrue);
    expect(event.startsAt.hour, 12);
    expect(event.rehearsalAt, isNotNull);
    expect(event.colorPalette, 'Preto e dourado');
  });

  test('formata dia da semana e horario em portugues no TZ da equipe', () {
    final utc = DateTime.parse('2026-08-09T12:00:00.000Z');

    final label = formatEventWeekdayDate(utc, 'America/Sao_Paulo');
    final time = formatEventTime(utc, 'America/Sao_Paulo');

    expect(label.toLowerCase(), contains('domingo'));
    expect(time, '09:00');
  });
}

```

## main.dart (diff relevant)
```dart
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:timezone/data/latest.dart' as tzdata;

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tzdata.initializeTimeZones();
  // Datas em portugues ("12 de agosto"). Sem isto o DateFormat com locale
  // pt_BR lanca excecao em tempo de execucao.
  await initializeDateFormatting('pt_BR');
  runApp(const ProviderScope(child: LouvorApp()));
}

class LouvorApp extends ConsumerWidget {
  const LouvorApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Escalas de Louvor',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: ref.watch(routerProvider),
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}

```
