import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import 'api_service.dart';
import 'local_mute_store.dart';
import 'local_window_engine.dart';
import 'metrics_reporter.dart';
import 'notifications_service.dart';
import 'signal_collectors.dart';

/// 执行层本地优先（F7/Q3 定案）：App 拉取事项 → 本地信号 → 本地窗口评估 → 本地通知。
class JenniferLocalEngine {
  JenniferLocalEngine._();

  static final JenniferLocalEngine instance = JenniferLocalEngine._();

  static const _active = {'parked', 'window_candidate', 'nudged'};

  Future<void> maybeNotify() async {
    try {
      final api = ApiService(ApiClient.instance);
      final items = await api.listItems();
      final active = items.where((i) => _active.contains(i.status)).toList();
      if (active.isEmpty) return;

      final muted = await LocalMuteStore.instance.mutedIds();
      final usage = await SignalCollectors.instance.usageStats(sinceMinutes: 60);
      final usageMinutes = (usage['totalForegroundMinutes'] as num?)?.toInt() ?? 0;
      final loc = await SignalCollectors.instance.locate();
      final sunny = loc != null ? await SignalCollectors.instance.isSunny(loc.lat, loc.lon) : false;
      const engine = LocalWindowEngine();

      LocalWindow? best;
      ItemCommitment? bestItem;
      for (final item in active) {
        if (muted.contains(item.id)) continue;
        final w = engine.compute(
          category: item.category,
          dueAt: item.dueAt,
          sunny: sunny,
          usageMinutes: usageMinutes,
          rhythm: const RhythmPolicy(dueOffsets: [], cooldownHours: 72),
        );
        // 只对"真实理由"窗口打扰（B8：无信号不得编造理由）
        if (w.reasonCode != 'manual_window' && w.fitScore > (best?.fitScore ?? 0)) {
          best = w;
          bestItem = item;
        }
      }
      if (best != null && bestItem != null) {
        await NotificationsService.instance.showWindowNotification(
          title: bestItem.title,
          body: best.reasonText,
          itemId: bestItem.id,
        );
        await MetricsReporter.instance.report(eventType: 'nudge_sent', itemId: bestItem.id, category: bestItem.category);
      }
    } catch (_) {
      // 本地评估失败不影响主流程
    }
  }

  /// 静默事项（"别再提"）：本地记录 + 同步后端 muted
  Future<void> mute(String itemId) async {
    await LocalMuteStore.instance.add(itemId);
    try {
      await ApiService(ApiClient.instance).patchItem(itemId, muted: true);
    } catch (_) {
      // 离线时静默失败，下次同步 muted 状态
    }
  }
}
