import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jnify_app/screens/home_shell.dart';
import 'package:jnify_app/screens/login_screen.dart';

/// 纯 widget 冒烟测试：不初始化 Supabase、不触网。
/// （Supabase.initialize 在 main() 中执行；AuthGate 依赖已初始化的 client，
/// 会话切换由真实环境验证。）
void main() {
  group('LoginScreen', () {
    Future<void> pumpLogin(WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
    }

    testWidgets('renders the email/password login form', (tester) async {
      await pumpLogin(tester);

      expect(find.widgetWithText(TextField, '邮箱'), findsOneWidget);
      expect(find.widgetWithText(TextField, '密码'), findsOneWidget);
      // 密码框应掩码显示。
      final passwordField = tester.widget<TextField>(
        find.widgetWithText(TextField, '密码'),
      );
      expect(passwordField.obscureText, isTrue);
      expect(find.widgetWithText(FilledButton, '登录'), findsOneWidget);
      expect(find.text('没有账号？注册'), findsOneWidget);
    });

    testWidgets('switches between login and sign up mode', (tester) async {
      await pumpLogin(tester);

      await tester.tap(find.text('没有账号？注册'));
      await tester.pump();

      expect(find.widgetWithText(FilledButton, '注册'), findsOneWidget);
      expect(find.text('已有账号？去登录'), findsOneWidget);

      await tester.tap(find.text('已有账号？去登录'));
      await tester.pump();

      expect(find.widgetWithText(FilledButton, '登录'), findsOneWidget);
    });

    testWidgets('empty submit shows validation error without network',
        (tester) async {
      await pumpLogin(tester);

      await tester.tap(find.widgetWithText(FilledButton, '登录'));
      await tester.pump();

      expect(find.text('请填写邮箱和密码'), findsOneWidget);
    });
  });

  group('HomeShell', () {
    testWidgets('renders the three-tab bottom navigation bar', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: HomeShell()));

      final navBar = find.byType(NavigationBar);
      expect(navBar, findsOneWidget);
      // 用 descendant 限定，避免与各页面的标题文案撞名。
      expect(
        find.descendant(of: navBar, matching: find.text('现在')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('全部')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('我的')),
        findsOneWidget,
      );
    });
  });
}
