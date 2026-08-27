import 'package:flutter/material.dart';

import 'all_screen.dart';
import 'me_screen.dart';
import 'now_screen.dart';

/// App 外壳：底部 3 Tab（现在 / 全部 / 我的），对应 SPEC Tab Bar。
/// 由 [AuthGate] 在登录后展示。
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = [NowScreen(), AllScreen(), MeScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today_outlined), label: '现在'),
          NavigationDestination(
              icon: Icon(Icons.list_alt_outlined), label: '全部'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    );
  }
}
