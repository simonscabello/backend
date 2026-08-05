### Task 5: EventRepository e providers

**Files:**
- Create: `app/lib/features/events/data/event_repository.dart`

**Interfaces:**
- Produces:
  - `list(teamId, {scope, limit})`
  - `find(eventId)`
  - `create(teamId, {...})`
  - `update(eventId, {...})`
  - `remove(eventId)`
  - `eventsProvider(teamId, scope)` FutureProvider.family
  - `eventProvider(eventId)` FutureProvider.family

- [ ] **Step 1: Repository espelhando TeamRepository**

```dart
class EventRepository {
  const EventRepository(this._dio);
  final Dio _dio;

  Future<List<Event>> list(
    String teamId, {
    String scope = 'upcoming',
    int limit = 20,
  }) async {
    return _guard(() async {
      final response = await _dio.get<List<dynamic>>(
        '/teams/$teamId/events',
        queryParameters: {'scope': scope, 'limit': limit},
      );
      return response.data!
          .map((e) => Event.fromJson(e as Map<String, dynamic>))
          .toList();
    });
  }
  // find, create, update, remove â€” mesmo padrao _guard
}
```

Providers: `eventRepositoryProvider`,  
`eventsProvider = FutureProvider.autoDispose.family` com record `(String teamId, String scope)` ou dois providers `upcomingEventsProvider` / `pastEventsProvider`.

---
