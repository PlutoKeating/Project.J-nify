import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth/auth_gate.dart';
import 'core/config/app_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 配置（含后端地址 / Supabase 端点）由 .env + dart-define 完全控制。
  await AppConfig.instance.load();
  // 注意：这是 publishable（anon）key，绝不放入 service role key。
  await Supabase.initialize(
    url: AppConfig.instance.supabaseUrl,
    publishableKey: AppConfig.instance.supabaseAnonKey,
  );
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
      home: const AuthGate(),
    );
  }
}
