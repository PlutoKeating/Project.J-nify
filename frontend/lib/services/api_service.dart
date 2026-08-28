import 'dart:convert';

import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import 'offline_queue.dart';

/// 业务 API 服务：封装 /v1/... 端点。
class ApiService {
  ApiService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> now() async {
    final data = await _client.get('/v1/now');
    return data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> capture(
    String rawText, {
    String category = 'life',
    DateTime? dueAt,
    int estMinutes = 5,
  }) async {
    final data = await _client.post('/v1/items/capture', body: {
      'raw_text': rawText,
      'category': category,
      if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
      'est_minutes': estMinutes,
    }) as Map<String, dynamic>;
    return data;
  }

  Future<List<ItemCommitment>> listItems({String? status}) async {
    final data = await _client.get(
      '/v1/items',
      query: status == null ? null : {'status': status},
    ) as List<dynamic>;
    return data
        .map((e) => ItemCommitment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> decide(
    String id,
    String decision, {
    String reason = '',
  }) async {
    final data = await _client.post('/v1/items/$id/decision', body: {
      'decision': decision,
      'reason': reason,
    });
    return data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> guardrails() async {
    final data = await _client.get('/v1/guardrails');
    return data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateGuardrails(Map<String, dynamic> body) async {
    final data = await _client.put('/v1/guardrails', body: body);
    return data as Map<String, dynamic>;
  }

  /// 当前用户资料（昵称/邮箱 email 由 Supabase Auth 提供，这里取 users.nickname）。
  Future<Map<String, dynamic>> getProfile() async {
    final data = await _client.get('/v1/me/profile');
    return data as Map<String, dynamic>;
  }

  /// 更新昵称（用户名，非唯一）。
  Future<Map<String, dynamic>> updateNickname(String nickname) async {
    final data = await _client.put('/v1/me/profile', body: {'nickname': nickname});
    return data as Map<String, dynamic>;
  }

  /// 更新时区（B9）
  Future<Map<String, dynamic>> updateTimezone(String timezone) async {
    final data = await _client.put('/v1/me/timezone', body: {'timezone': timezone});
    return data as Map<String, dynamic>;
  }

  /// 彻底注销（D3/Q17：清空业务数据 + 删除 auth 账户）
  Future<Map<String, dynamic>> deleteAllData() async {
    final data = await _client.delete('/v1/me/data');
    return data as Map<String, dynamic>;
  }

  /// 编辑事项（标题/类目/期限/时长/静默）
  Future<Map<String, dynamic>> patchItem(
    String id, {
    String? title,
    String? category,
    DateTime? dueAt,
    int? estMinutes,
    bool? muted,
  }) async {
    final body = <String, dynamic>{
      if (title != null) 'title': title,
      if (category != null) 'category': category,
      if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
      if (estMinutes != null) 'est_minutes': estMinutes,
      if (muted != null) 'muted': muted,
    };
    final data = await _client.patch('/v1/items/$id', body: body);
    return data as Map<String, dynamic>;
  }

  /// 硬删事项（前端需二次确认）
  Future<Map<String, dynamic>> deleteItem(String id) async {
    final data = await _client.delete('/v1/items/$id');
    return data as Map<String, dynamic>;
  }

  /// 与 Jennifer 对话（自然语言 CRUD / 策略 / 草稿）
  Future<Map<String, dynamic>> chat(String message, {List<Map<String, String>> history = const []}) async {
    final data = await _client.post('/v1/jennifer/chat', body: {'message': message, 'history': history});
    return data as Map<String, dynamic>;
  }

  /// 天地图逆地理编码（服务端代理；坐标已模糊化，仅返回城市/地址）
  Future<Map<String, dynamic>> reverseGeocode(double lat, double lon) async {
    final data = await _client.post('/v1/geo/reverse', body: {'lat': lat, 'lon': lon});
    return data as Map<String, dynamic>;
  }

  /// 匿名指标事件（G1）
  Future<dynamic> reportEvent(
    String eventType, {
    String? itemId,
    String? category,
    String? status,
    String? decision,
    int? durationMinutes,
  }) {
    return _client.post('/v1/metrics/events', body: {
      'event_type': eventType,
      if (itemId != null) 'item_id': itemId,
      if (category != null) 'category': category,
      if (status != null) 'status': status,
      if (decision != null) 'decision': decision,
      if (durationMinutes != null) 'duration_minutes': durationMinutes,
    });
  }

  /// 重放离线队列（E4：重连自动同步，last-write-wins）
  Future<void> syncPending() async {
    final pending = await OfflineQueue.instance.pending();
    for (final row in pending) {
      final id = row['id'] as int;
      final method = row['method'] as String;
      final path = row['path'] as String;
      final rawBody = row['body'] as String?;
      final body = rawBody == null ? null : (jsonDecode(rawBody) as Map<String, dynamic>);
      try {
        switch (method) {
          case 'POST':
            await _client.post(path, body: body);
          case 'PATCH':
            await _client.patch(path, body: body);
          case 'PUT':
            await _client.put(path, body: body);
          case 'DELETE':
            await _client.delete(path);
        }
        await OfflineQueue.instance.remove(id);
      } catch (_) {
        // 网络仍不可用/校验失败：保留队列，下次再试
        break;
      }
    }
  }

  Future<dynamic> postSignal(String type, Map<String, dynamic> payload) async {
    return _client.post('/v1/signals', body: {
      'signal_type': type,
      'payload': payload,
    });
  }
}
