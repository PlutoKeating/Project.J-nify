import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../screens/home_shell.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding_screen.dart';
import '../services/api_service.dart';
import '../services/tour_registry.dart';
import 'account.dart';

/// 认证门卫：跟着 [Account] 的登录状态切换，未登录 → [LoginScreen]，已登录 → [HomeShell]。
/// 登录状态在 [main] 里从安全存储读出（本组件不触网，便于纯 widget 测试）。
class AuthGate extends StatefulWidget {
  const AuthGate({super.key, this.account});

  /// 测试可注入；缺省用 [Account.instance]。
  final Account? account;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  Account get _account => widget.account ?? Account.instance;

  Future<void> _syncPending() async {
    try {
      await ApiService(ApiClient.instance).syncPending();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _account,
      builder: (context, _) {
        if (!_account.signedIn) return const LoginScreen();
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
