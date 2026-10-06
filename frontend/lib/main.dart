import 'dart:async';

import 'package:flutter/material.dart';

import 'auth/account.dart';
import 'auth/auth_gate.dart';
import 'core/config/app_config.dart';
import 'services/jennifer_local_engine.dart';
import 'services/notifications_service.dart';

/// 全局 ScaffoldMessenger：供没有 BuildContext 的地方弹出提示。
final _rootMessengerKey = GlobalKey<ScaffoldMessengerState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 配置（后端地址等）由 .env + dart-define 控制。
  await AppConfig.instance.load();
  // PlutoKeating 账号：读出上次保存的登录状态（不触网；令牌快过期时首个请求会静默刷新）
  await Account.instance.load();
  // 本地通知初始化 + 通知内「别再提」动作 → 本地静默 + 同步后端
  NotificationsService.instance.onMuteAction = (itemId) => JenniferLocalEngine.instance.mute(itemId);
  unawaited(NotificationsService.instance.init());
  runApp(const JnifyApp());
}

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
