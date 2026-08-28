import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jnify_app/screens/home_shell.dart';
import 'package:jnify_app/screens/login_screen.dart';
import 'package:jnify_app/screens/me_screen.dart';

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

    testWidgets('password field toggles visibility via the eye icon',
        (tester) async {
      await pumpLogin(tester);

      final passwordField = tester.widget<TextField>(
        find.widgetWithText(TextField, '密码'),
      );
      expect(passwordField.obscureText, isTrue);

      await tester.tap(find.byIcon(Icons.visibility_off_outlined));
      await tester.pump();
      expect(
        tester.widget<TextField>(find.widgetWithText(TextField, '密码'))
            .obscureText,
        isFalse,
      );

      await tester.tap(find.byIcon(Icons.visibility_outlined));
      await tester.pump();
      expect(
        tester.widget<TextField>(find.widgetWithText(TextField, '密码'))
            .obscureText,
        isTrue,
      );
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

  group('MeScreen', () {
    testWidgets('renders the logout entry without network', (tester) async {
      // 纯渲染断言：不点按按钮，避免触发 signOut 网络调用。
      // initState 的 guardrails 请求在测试绑定下返回 mock 400 并被吞掉。
      // 真实使用中 MeScreen 位于 HomeShell 的 Scaffold body 内，测试同样
      // 包一层 Scaffold 以提供 ListTile 所需的 Material 祖先。
      await tester
          .pumpWidget(const MaterialApp(home: Scaffold(body: MeScreen())));
      await tester.pumpAndSettle();

      expect(find.text('退出登录'), findsOneWidget);
      // 资料卡 + 设置入口 + 可折叠区块（默认折叠）
      expect(find.byIcon(Icons.settings_outlined), findsOneWidget);
      expect(find.text('未设置昵称'), findsOneWidget);
      expect(find.byKey(const ValueKey('privacy')), findsOneWidget);
      expect(find.byKey(const ValueKey('about')), findsOneWidget);
    });

    testWidgets('隐私说明/关于 J-nify 默认折叠，点击后展开', (tester) async {
      tester.view.physicalSize = const Size(800, 1800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester
          .pumpWidget(const MaterialApp(home: Scaffold(body: MeScreen())));
      await tester.pumpAndSettle();

      // 折叠：正文不可见
      expect(find.textContaining('把计划感偏弱'), findsNothing);
      expect(find.textContaining('原始信号'), findsNothing);

      await tester.ensureVisible(find.text('关于 J-nify'));
      await tester.tap(find.text('关于 J-nify'));
      await tester.pumpAndSettle();
      expect(find.textContaining('把计划感偏弱'), findsOneWidget);

      await tester.ensureVisible(find.text('隐私说明'));
      await tester.tap(find.text('隐私说明'));
      await tester.pumpAndSettle();
      expect(find.textContaining('原始信号'), findsOneWidget);
    });
  });
}
