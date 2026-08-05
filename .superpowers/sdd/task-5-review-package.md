```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../domain/event_models.dart';

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

  Future<Event> find(String eventId) async {
    return _guard(() async {
      final response =
          await _dio.get<Map<String, dynamic>>('/events/$eventId');
      return Event.fromJson(response.data!);
    });
  }

  Future<Event> create(
    String teamId, {
    required String title,
    required String startsAt,
    String? rehearsalAt,
    String? location,
    String? notes,
    String? colorPalette,
  }) async {
    return _guard(() async {
      final response = await _dio.post<Map<String, dynamic>>(
        '/teams/$teamId/events',
        data: {
          'title': title,
          'startsAt': startsAt,
          if (rehearsalAt != null) 'rehearsalAt': rehearsalAt,
          if (location != null && location.isNotEmpty) 'location': location,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (colorPalette != null && colorPalette.isNotEmpty)
            'colorPalette': colorPalette,
        },
      );
      return Event.fromJson(response.data!);
    });
  }

  Future<Event> update(
    String eventId, {
    String? title,
    String? startsAt,
    String? rehearsalAt,
    bool removeRehearsalAt = false,
    String? location,
    String? notes,
    String? colorPalette,
  }) async {
    return _guard(() async {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/events/$eventId',
        data: {
          if (title != null) 'title': title,
          if (startsAt != null) 'startsAt': startsAt,
          if (removeRehearsalAt) 'rehearsalAt': null,
          if (rehearsalAt != null) 'rehearsalAt': rehearsalAt,
          if (location != null) 'location': location,
          if (notes != null) 'notes': notes,
          if (colorPalette != null) 'colorPalette': colorPalette,
        },
      );
      return Event.fromJson(response.data!);
    });
  }

  Future<void> remove(String eventId) async {
    return _guard(() async {
      await _dio.delete<void>('/events/$eventId');
    });
  }

  Future<T> _guard<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final eventRepositoryProvider = Provider<EventRepository>((ref) {
  return EventRepository(ref.watch(dioProvider));
});

typedef EventsQuery = (String teamId, String scope);

final eventsProvider =
    FutureProvider.autoDispose.family<List<Event>, EventsQuery>(
  (ref, query) {
    final (teamId, scope) = query;
    return ref.watch(eventRepositoryProvider).list(teamId, scope: scope);
  },
);

final eventProvider =
    FutureProvider.autoDispose.family<Event, String>((ref, eventId) {
  return ref.watch(eventRepositoryProvider).find(eventId);
});

```
