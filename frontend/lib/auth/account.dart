import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// PlutoKeating 账号（作者各产品共用的统一账号，`id.plutokeating.beer`）。
///
/// 登录走标准的 OpenID Connect 授权码 + PKCE（flutter_appauth：Android 用 Custom Tabs，iOS 用
/// ASWebAuthenticationSession），打开的就是账号服务的登录页：邮箱验证码、通行密钥、GitHub 三选一，
/// 第一次用自动建账号。App 自己不处理密码或验证码。
///
/// 令牌只存在系统的安全存储里（Android Keystore / iOS Keychain）：
/// - 访问令牌（1 小时）给后端用，快过期时用刷新令牌（30 天，滑动）静默换新；
/// - ID 令牌只用来在本机显示邮箱与名字。
class Account extends ChangeNotifier {
  Account._({FlutterAppAuth? appAuth, FlutterSecureStorage? storage})
      : _appAuth = appAuth ?? const FlutterAppAuth(),
        _storage = storage ?? const FlutterSecureStorage();

  static final Account instance = Account._();

  static const issuer = 'https://id.plutokeating.beer/';
  static const discoveryUrl = 'https://id.plutokeating.beer/.well-known/openid-configuration';
  static const clientId = 'jnify-app';
  static const redirectUrl = 'com.plutokeating.jnify://callback';
  static const settingsUrl = 'https://id.plutokeating.beer/settings';
  static const scopes = ['openid', 'profile', 'email', 'offline_access', 'jnify.items.read', 'jnify.items.write'];

  static const _kAccess = 'pk.access', _kRefresh = 'pk.refresh', _kId = 'pk.id', _kExpiry = 'pk.expiry';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _storage;

  String? _access, _refresh, _idToken;
  DateTime? _expiry;
  bool _loaded = false;
  Future<String?>? _refreshing;

  bool get loaded => _loaded;
  bool get signedIn => _refresh != null || _access != null;

  /// ID 令牌里的资料（没登录或令牌里没有时为 null）。
  Map<String, dynamic> get _claims => _decode(_idToken);
  String? get email => _claims['email'] as String?;
  String? get name => (_claims['name'] as String?) ?? (_claims['preferred_username'] as String?);

  /// 启动时读出上次保存的令牌（不触网）。
  Future<void> load() async {
    try {
      _access = await _storage.read(key: _kAccess);
      _refresh = await _storage.read(key: _kRefresh);
      _idToken = await _storage.read(key: _kId);
      final e = await _storage.read(key: _kExpiry);
      _expiry = e == null ? null : DateTime.tryParse(e);
    } catch (_) {
      // 安全存储不可用（测试环境等）：当作没登录
    }
    _loaded = true;
    notifyListeners();
  }

  /// 打开账号服务的登录页；成功后保存令牌。用户取消时抛 [AccountCancelled]。
  Future<void> signIn() async {
    try {
      final r = await _appAuth.authorizeAndExchangeCode(AuthorizationTokenRequest(
        clientId,
        redirectUrl,
        discoveryUrl: discoveryUrl,
        scopes: scopes,
      ));
      await _save(r.accessToken, r.refreshToken, r.idToken, r.accessTokenExpirationDateTime);
    } on FlutterAppAuthUserCancelledException {
      throw const AccountCancelled();
    }
  }

  /// 给后端用的访问令牌：还有一分钟以上有效就直接用，否则先静默刷新（并发调用只刷新一次）。没登录返回 null。
  Future<String?> accessToken() async {
    if (_access != null && _expiry != null && _expiry!.isAfter(DateTime.now().add(const Duration(minutes: 1)))) {
      return _access;
    }
    if (_refresh == null) return _access;
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<String?> _doRefresh() async {
    try {
      final r = await _appAuth.token(TokenRequest(
        clientId,
        redirectUrl,
        discoveryUrl: discoveryUrl,
        refreshToken: _refresh,
        grantType: GrantType.refreshToken,
        scopes: scopes,
      ));
      await _save(r.accessToken, r.refreshToken ?? _refresh, r.idToken ?? _idToken, r.accessTokenExpirationDateTime);
      return _access;
    } on FlutterAppAuthPlatformException catch (e) {
      // 刷新令牌失效（被吊销、过期）：退出登录；网络问题：保留状态，下次再试
      final err = e.platformErrorDetails.error ?? '';
      if (err == 'invalid_grant' || err == 'unauthorized_client') await signOutLocal();
      return null;
    } catch (_) {
      return null;
    }
  }

  /// 只清掉本机的登录状态（后端说令牌无效时也调用它）。
  Future<void> signOutLocal() async {
    _access = _refresh = _idToken = null;
    _expiry = null;
    try {
      await _storage.deleteAll();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> _save(String? access, String? refresh, String? id, DateTime? expiry) async {
    _access = access;
    _refresh = refresh;
    _idToken = id;
    _expiry = expiry;
    try {
      await _storage.write(key: _kAccess, value: access);
      await _storage.write(key: _kRefresh, value: refresh);
      await _storage.write(key: _kId, value: id);
      await _storage.write(key: _kExpiry, value: expiry?.toIso8601String());
    } catch (_) {}
    notifyListeners();
  }

  /// 测试用：直接设定登录状态。
  @visibleForTesting
  void debugSet({String? access, String? refresh, String? idToken, DateTime? expiry}) {
    _access = access;
    _refresh = refresh;
    _idToken = idToken;
    _expiry = expiry;
    _loaded = true;
    notifyListeners();
  }

  static Map<String, dynamic> _decode(String? jwt) {
    if (jwt == null) return const {};
    final parts = jwt.split('.');
    if (parts.length < 2) return const {};
    try {
      return jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
    } catch (_) {
      return const {};
    }
  }
}

class AccountCancelled implements Exception {
  const AccountCancelled();
}
