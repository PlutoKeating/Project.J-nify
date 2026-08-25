import 'package:flutter/material.dart';

import 'core/config/app_config.dart';
import 'screens/all_screen.dart';
import 'screens/me_screen.dart';
import 'screens/now_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 配置（含后端地址）由 .env 完全控制。
  await AppConfig.instance.load();
  runApp(const JnifyApp());
}

class JnifyApp extends StatelessWidget {
  const JnifyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'J-nify',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFF5A4E)),
        scaffoldBackgroundColor: const Color(0xFFF7F7F4),
      ),
      home: const HomeShell(),
    );
  }
}

/// App 外壳：底部 3 Tab（现在 / 全部 / 我的），对应 SPEC Tab Bar。
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
          NavigationDestination(icon: Icon(Icons.list_alt_outlined), label: '全部'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    );
  }
}
