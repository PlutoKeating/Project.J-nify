import 'dart:convert';

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
  String? get _accessToken {
    final supabase = Supabase.instance;
    if (!supabase.isInitialized) return null;
    return supabase.client.auth.currentSession?.accessToken;
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

  Future<dynamic> delete(String path) async {
    final res =
        await http.delete(_uri(path), headers: _headers()).timeout(_timeout);
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
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
}
