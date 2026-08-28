import '../core/api/api_client.dart';
import '../models/item_commitment.dart';

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
  }) async {
    final data = await _client.post('/v1/items/capture', body: {
      'raw_text': rawText,
      'category': category,
      if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
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

  Future<dynamic> postSignal(String type, Map<String, dynamic> payload) async {
    return _client.post('/v1/signals', body: {
      'signal_type': type,
      'payload': payload,
    });
  }
}
