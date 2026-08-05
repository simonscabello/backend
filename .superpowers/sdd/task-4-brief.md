### Task 4: Modelos Dart + formataÃ§Ã£o de datas (TDD)

**Files:**
- Modify: `app/pubspec.yaml` (add `timezone: ^0.10.1` ou versÃ£o compatÃ­vel)
- Modify: `app/lib/main.dart`
- Create: `app/lib/features/events/domain/event_models.dart`
- Create: `app/lib/features/events/domain/event_datetime.dart`
- Create: `app/test/event_datetime_test.dart`

**Interfaces:**
- Produces:
  - `class Event` com `fromJson`
  - `DateTime eventLocalTime(DateTime utc, String timezone)`
  - `String formatEventWeekdayDate(DateTime utc, String timezone)`
  - `String formatEventTime(DateTime utc, String timezone)` â†’ ex. `09:00`

- [ ] **Step 1: Escrever testes que falham**

```dart
// app/test/event_datetime_test.dart
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
      'startsAt': '2026-08-09T12:00:00.000Z', // 09:00 em America/Sao_Paulo
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
    // Domingo 09/08/2026 09:00 BRT
    expect(label.toLowerCase(), contains('domingo'));
    expect(time, '09:00');
  });
}
```

- [ ] **Step 2: Rodar e ver falha**

```
$env:PATH = 'C:\Users\Acer\flutter\bin;' + $env:PATH
cd app; flutter test test/event_datetime_test.dart
```
Expected: FAIL (arquivo/sÃ­mbolos inexistentes).

- [ ] **Step 3: Implementar modelos + helper + timezone**

1. `cd app; flutter pub add timezone`
2. Em `main.dart`, apÃ³s `WidgetsFlutterBinding`:
```dart
import 'package:timezone/data/latest.dart' as tzdata;
tzdata.initializeTimeZones();
```
3. Implementar `Event` e funÃ§Ãµes de formataÃ§Ã£o com `TZDateTime.from(utc, getLocation(tz))` e `DateFormat` `pt_BR` (ex. `EEEE, d 'de' MMMM` + `HH:mm`).

- [ ] **Step 4: Testes passam**

Run: `flutter test test/event_datetime_test.dart`  
Expected: All tests passed.

---
