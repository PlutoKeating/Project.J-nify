import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth/auth_gate.dart';
import 'core/config/app_config.dart';

/// 全局 ScaffoldMessenger：供深链等无 BuildContext 场景弹出错误提示。
final _rootMessengerKey = GlobalKey<ScaffoldMessengerState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 配置（含后端地址 / Supabase 端点）由 .env + dart-define 完全控制。
  await AppConfig.instance.load();
  // 注意：这是 publishable（anon）key，绝不放入 service role key。
  // authOptions：显式开启会话持久化 + 自动刷新；关闭 Supabase 自带深链观测器
  // （它只处理 OAuth code/access_token，不处理邮件确认的 token_hash verify 链接），
  // 深链统一由下方 app_links 自行处理。会话存活时长由服务端 Auth 配置决定
  // （见 docs/devops/email-callback.md §会话时长：Inactivity timeout=30 天 / 关 time-box）。
  await Supabase.initialize(
    url: AppConfig.instance.supabaseUrl,
    publishableKey: AppConfig.instance.supabaseAnonKey,
    authOptions: const FlutterAuthClientOptions(
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUri: false,
    ),
  );
  runApp(const JnifyApp());
  _bindDeepLinkHandler();
}

/// 订阅系统深链（App Link / Universal Link）。冷启动的首条链接也会出现在
/// `uriLinkStream`（app_links 在移动端将初始链接作为首个事件发出），无需额外
/// 处理初始链接。
void _bindDeepLinkHandler() {
  // app_links 底层平台单例持有 uriLinkStream（broadcast），订阅在 App 生命周期内
  // 常驻，无需上层保存订阅引用。
  AppLinks().uriLinkStream.listen((Uri? uri) {
    if (uri != null) _handleAuthDeepLink(uri);
  });
}

/// 处理 App Link 进入的回调：邮件确认/邮箱变更/重置密码的 `verify` 链接
/// 用 `verifyOTP`（token_hash + type）换取会话；OAuth/PKCE 的 `code`/
/// `access_token` 链接用 `getSessionFromUrl`。
Future<void> _handleAuthDeepLink(Uri uri) async {
  if (uri.host != AppConfig.appLinkHost) return;
  final auth = Supabase.instance.client.auth;
  final tokenHash = uri.queryParameters['token_hash'] ?? uri.queryParameters['token'];
  final code = uri.queryParameters['code'];
  final hasAccessToken = uri.queryParameters.containsKey('access_token');
  try {
    if (tokenHash != null) {
      await auth.verifyOTP(
        tokenHash: tokenHash,
        type: _otpType(uri.queryParameters['type'] ?? 'signup'),
      );
    } else if (code != null || hasAccessToken) {
      await auth.getSessionFromUrl(uri);
    }
  } catch (e) {
    // 链接过期/无效等：用全局 messenger 提示，用户可回 App 重新发起。
    _rootMessengerKey.currentState?.showSnackBar(
      SnackBar(content: Text('验证失败：$e'), behavior: SnackBarBehavior.floating),
    );
  }
}

/// GoTrue verify 链接的 `type` 查询参数 → [OtpType]。
OtpType _otpType(String raw) => switch (raw) {
      'recovery' => OtpType.recovery,
      'email_change' => OtpType.emailChange,
      'magiclink' => OtpType.magiclink,
      'invite' => OtpType.invite,
      'signup' || 'email' => OtpType.signup,
      _ => OtpType.email,
    };

class JnifyApp extends StatelessWidget {
  const JnifyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'J-nify',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _rootMessengerKey,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFF5A4E)),
        scaffoldBackgroundColor: const Color(0xFFF7F7F4),
      ),
      home: const AuthGate(),
    );
  }
}
