/// 本地窗口引擎（Dart 移植 backend/src/services/window-engine.ts + 节奏/冷却策略）。
/// 执行层本地优先：App 用本地信号评估窗口并触发本地通知。
class RhythmPolicy {
  const RhythmPolicy({required this.dueOffsets, required this.cooldownHours});

  final List<int> dueOffsets;
  final int cooldownHours;
}

class LocalWindow {
  const LocalWindow({required this.reasonCode, required this.reasonText, required this.fitScore});

  final String reasonCode;
  final String reasonText;
  final double fitScore;
}

class LocalWindowEngine {
  const LocalWindowEngine();

  static const int _dayMs = 86400000;

  LocalWindow compute({
    required String category,
    DateTime? dueAt,
    required bool sunny,
    required int usageMinutes,
    required RhythmPolicy rhythm,
    DateTime? now,
  }) {
    final t = now ?? DateTime.now();
    if (dueAt != null) {
      final diffMs = dueAt.difference(t).inMilliseconds;
      if (diffMs <= 0) {
        return const LocalWindow(reasonCode: 'overdue', reasonText: '已到期，仍为您保留，随时可处理。', fitScore: 0.6);
      }
      final days = (diffMs / _dayMs).ceil();
      final matched = rhythm.dueOffsets.isEmpty ? days <= 10 : rhythm.dueOffsets.contains(days);
      if (matched) {
        return LocalWindow(reasonCode: 'due_soon', reasonText: '还有 $days 天到期，现在是顺手处理的好时机。', fitScore: 0.85);
      }
    }
    if (category == 'chore' && sunny) {
      return const LocalWindow(reasonCode: 'weather', reasonText: '这两天天气合适，正是顺手处理的好时候。', fitScore: 0.8);
    }
    if (category == 'social' && usageMinutes >= 20) {
      return LocalWindow(reasonCode: 'usage_state', reasonText: '您刚刷手机 $usageMinutes 分钟，适合花一分钟收个尾。', fitScore: 0.75);
    }
    return const LocalWindow(reasonCode: 'manual_window', reasonText: '我把这件事放在了「最顺手」的位置，您随时可以处理。', fitScore: 0.5);
  }
}
