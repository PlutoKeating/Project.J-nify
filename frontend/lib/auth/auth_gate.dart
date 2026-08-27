import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../screens/home_shell.dart';
import '../screens/login_screen.dart';

/// 认证门卫：监听 Supabase 会话变化，未登录 → [LoginScreen]，已登录 →
/// [HomeShell]。依赖 [Supabase.initialize] 已在 [main] 完成（本组件不触发
/// 初始化、不触网，便于纯 widget 测试）。
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session == null) return const LoginScreen();
        return const HomeShell();
      },
    );
  }
}
