import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;

import 'package:http/http.dart' as http;

import '../../auth/account.dart';
import '../config/app_config.dart';
import 'api_exception.dart';

/// 轻量 HTTP 客户端。base URL 来自 `.env`（[AppConfig.backendBaseUrl]）；
/// 已登录 PlutoKeating 账号时自动附加 `Authorization: Bearer <访问令牌>`（快过期时先静默刷新）。
class ApiClient {
  ApiClient._();

  static final ApiClient instance = ApiClient._();

  Future<Map<String, String>> _headers([Map<String, String>? extra]) async {
    String? token;
    try {
      token = await Account.instance.accessToken();
    } catch (_) {
      token = null; // 安全存储 / 插件不可用（测试环境）：不带令牌
    }
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
        .get(_uri(path, query: query), headers: await _headers())
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .post(_uri(path), headers: await _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> put(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .put(_uri(path), headers: await _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) async {
    final res = await http
        .patch(_uri(path), headers: await _headers(), body: jsonEncode(body ?? {}))
        .timeout(_timeout);
    return _decode(res);
  }

  Future<dynamic> delete(String path) async {
    final res =
        await http.delete(_uri(path), headers: await _headers()).timeout(_timeout);
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
    (await _headers()).forEach((key, value) {
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

  /// 401 = 登录失效（令牌被吊销或刷新失败）：清掉本机登录状态，[AuthGate] 回到登录页。
  void _invalidateSessionOn401(int statusCode) {
    if (statusCode != 401) return;
    unawaited(Account.instance.signOutLocal());
  }
}
