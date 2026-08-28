import '../core/api/api_client.dart';
import '../services/api_service.dart';

/// 匿名指标埋点（G1 定案）：仅 id/类目/状态/时长，不含事项内容。
class MetricsReporter {
  MetricsReporter._();

  static final MetricsReporter instance = MetricsReporter._();

  final ApiService _api = ApiService(ApiClient.instance);

  Future<void> report({
    required String eventType,
    String? itemId,
    String? category,
    String? status,
    String? decision,
    int? durationMinutes,
  }) async {
    try {
      await _api.reportEvent(
        eventType,
        itemId: itemId,
        category: category,
        status: status,
        decision: decision,
        durationMinutes: durationMinutes,
      );
    } catch (_) {
      // 埋点失败不影响主流程
    }
  }
}
