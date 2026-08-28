import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api/api_client.dart';
import '../screens/home_shell.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding_screen.dart';
import '../services/api_service.dart';
import '../services/tour_registry.dart';

/// 认证门卫：监听 Supabase 会话变化，未登录 → [LoginScreen]，已登录 →
/// [HomeShell]。依赖 [Supabase.initialize] 已在 [main] 完成（本组件不触发
/// 初始化、不触网，便于纯 widget 测试）。
///
/// 首次进入时若已存在持久化会话（自动登录），会主动 `refreshSession()`：
/// 拿到新 access token 的同时，也让服务端重置“未活动时间”，从而满足
/// “只要用户常登录，登录状态就永不注销”（会话惰性超时滑动，见
/// docs/devops/email-callback.md §会话时长）。
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  void initState() {
    super.initState();
    _refreshOnAutoLogin();
  }

  Future<void> _refreshOnAutoLogin() async {
    try {
      final auth = Supabase.instance.client.auth;
      // 无会话时不刷新；刷新失败（网络/无网络/会话已失效）不影响当前渲染。
      if (auth.currentSession == null) return;
      await auth.refreshSession();
    } catch (_) {
      // 忽略：Supabase 内部对无效/过期刷新会自行清理，这里交由会话监听兜底。
    }
  }

  Future<void> _syncPending() async {
    try {
      await ApiService(ApiClient.instance).syncPending();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session == null) return const LoginScreen();
        _syncPending();
        return FutureBuilder<bool>(
          future: TourRegistry.instance.shouldShow('onboarding', 1),
          builder: (context, tour) {
            if (tour.connectionState != ConnectionState.done || tour.data != true) {
              return const HomeShell();
            }
            return OnboardingScreen(onFinished: () => setState(() {}));
          },
        );
      },
    );
  }
}
