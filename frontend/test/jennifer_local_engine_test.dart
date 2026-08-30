import 'package:flutter_test/flutter_test.dart';
import 'package:jnify_app/services/jennifer_local_engine.dart';
import 'package:jnify_app/services/local_window_engine.dart';

void main() {
  test('parses server rhythm and uses due offsets in the local engine', () {
    final policies = parseRhythmPolicies({
      'bill': {
        'due_offsets': [
          {'days_before': 10},
          {'days_before': 3},
          {'days_before': 0},
        ],
        'cooldown_hours': 24,
      },
      'invalid': 'ignored',
    });

    expect(policies.keys, ['bill']);
    expect(policies['bill']!.dueOffsets, [10, 3]);
    expect(policies['bill']!.cooldownHours, 24);

    const engine = LocalWindowEngine();
    final now = DateTime.utc(2026, 8, 30, 10);
    final window = engine.compute(
      category: 'bill',
      dueAt: now.add(const Duration(days: 3)),
      sunny: false,
      usageMinutes: 0,
      rhythm: policies['bill']!,
      now: now,
    );
    expect(window.reasonCode, 'due_soon');
  });
}
