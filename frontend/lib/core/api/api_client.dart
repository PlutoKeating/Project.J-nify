import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';
import 'api_exception.dart';

/// 轻量 HTTP 客户端。base URL 来自 `.env`（[AppConfig.backendBaseUrl]）；
/// 若存在 Supabase 会话，自动附加 `Authorization: Bearer <accessToken>`。
class ApiClient {
  ApiClient._();

  static final ApiClient instance = ApiClient._();

  /// 当前 Supabase 会话的 access token；Supabase 未初始化或未登录时为 null。
  ///
  /// debug 下 `Supabase.instance` 在未初始化时会先抛 AssertionError（早于
  /// `isInitialized` 判断），故整体 try/catch 包裹，保证 debug/test 不炸。
  String? get _accessToken {
    try {
      if (!Supabase.instance.isInitialized) return null;
      return Supabase.instance.client.auth.currentSession?.accessToken;
    } catch (_) {
      return null;
    }
  }

  Map<String, String> _headers([Map<String, String>? extra]) {
    final token = _accessToken;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
      ...?extra,
    };
  }

  Uri _uri(String path, {Map<String, String>? query}) {
    var base = AppConfig.instance.backendBaseUrl;
    while (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    var p = path;
    if (!p.startsWith('/')) {
      p = '/$p';
    }
    final uri = Uri.parse('$base$p');
    return query == null ? uri : uri.replace(queryParameters: query);
  }

  Duration get _timeout =>
      Duration(seconds: AppConfig.instance.apiTimeoutSeconds);

  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    final res = await http
        .get(_uri(path, query: query), headers: _headers())
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .post(_uri(path), headers: _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> put(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .put(_uri(path), headers: _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .patch(_uri(path), headers: _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> delete(String path) async {
    final res =
        await http.delete(_uri(path), headers: _headers()).timeout(_timeout);
    return _decode(res);
  }

  /// SSE 流式 POST（Jennifer 对话流）：返回原始字节流，调用方自行解析事件。
  /// 非 2xx 时抛出 [ApiException]（含 401 静默登出）。
  Future<io.HttpClientResponse> streamPost(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final client = io.HttpClient();
    final req = await client.postUrl(_uri(path));
    req.headers.contentType = io.ContentType.json;
    _headers().forEach((key, value) {
      req.headers.set(key, value);
    });
    req.add(utf8.encode(jsonEncode(body ?? {})));
    final res = await req.close();
    if (res.statusCode >= 400) {
      final text = await utf8.decodeStream(res);
      _invalidateSessionOn401(res.statusCode);
      throw ApiException(res.statusCode, text);
    }
    return res;
  }

  dynamic _decode(http.Response res) {
    _invalidateSessionOn401(res.statusCode);
    final text = utf8.decode(res.bodyBytes);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return text.isEmpty ? null : jsonDecode(text);
    }
    var message = '请求失败 (${res.statusCode})';
    try {
      final decoded = jsonDecode(text);
      message = decoded['detail']?.toString() ?? message;
    } catch (_) {}
    throw ApiException(res.statusCode, message);
  }

  /// 401 = 会话失效（token 过期/被吊销）：fire-and-forget 触发
  /// `auth.signOut()`，onAuthStateChange 会让 AuthGate 在下次重建时回到登录页。
  ///
  /// 幂等（无会话时 signOut 为 no-op）且不阻塞当前请求；signOut 只清理本地
  /// 会话，与当前请求抛出的 [ApiException]（含 401）互不干扰，无递归风险。
  void _invalidateSessionOn401(int statusCode) {
    if (statusCode != 401) return;
    unawaited(_silentSignOut());
  }

  Future<void> _silentSignOut() async {
    try {
      await Supabase.instance.client.auth.signOut();
    } catch (_) {
      // 幂等兜底：会话已失效、无会话或 Supabase 未初始化（debug/test）时忽略。
    }
  }
}
