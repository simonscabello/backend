# Task 4 — Modelos Dart + formatação de datas

## Status

Concluída sem commits.

## TDD

### RED

Antes da implementação, executei:

```powershell
flutter test test/event_datetime_test.dart
```

O comando falhou como esperado: os imports `event_datetime.dart` e
`event_models.dart` não existiam, o pacote `timezone` não estava resolvido e
os símbolos `Event`, `formatEventWeekdayDate` e `formatEventTime` estavam
indefinidos.

### GREEN

Após adicionar `timezone: ^0.11.1`, implementar o modelo e os helpers, o mesmo
teste passou:

```text
00:00 +2: All tests passed!
```

## Implementação

- `Event.fromJson` converte datas ISO para UTC e mapeia os campos do contrato.
- Helpers convertem UTC para o fuso da equipe e formatam data/hora em `pt_BR`.
- `main.dart` inicializa a base de fusos do pacote `timezone`.

## Verificações adicionais

- `flutter analyze`: `No issues found!`
- `flutter test`: `23` testes passaram.

## Pendências e preocupações

- APK release não foi gerado, pois não fazia parte da tarefa.
