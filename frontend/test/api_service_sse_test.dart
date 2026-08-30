import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:jnify_app/services/api_service.dart';

void main() {
  test('decodeJenniferSse preserves event order and ignores invalid JSON',
      () async {
    final source = Stream<List<int>>.fromIterable([
      utf8.encode('event: start\ndata: {"session_id":"s1"}\n\n'),
      utf8.encode('event: delta\ndata: not-json\n\n'),
      utf8.encode('event: delta\ndata: {"text":"您好"}\n\n'),
      utf8.encode('event: done\ndata: {"reply":"您好"}\n\n'),
    ]);

    final events = await decodeJenniferSse(source).toList();

    expect(events.map((event) => event['event']), ['start', 'delta', 'done']);
    expect(events[1]['data'], {'text': '您好'});
    expect(events[2]['data'], {'reply': '您好'});
  });
}
