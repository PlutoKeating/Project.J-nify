import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jnify_app/screens/settings_screen.dart';

/// 纯 widget 冒烟测试：设置页分组渲染（不初始化 Supabase、不触网）。
/// initState 的 profile 请求在测试绑定下返回 mock 400 并被吞掉。
void main() {
  group('SettingsScreen', () {
    testWidgets('renders 账户资料/安全 groups and fields', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));
      await tester.pumpAndSettle();

      expect(find.text('账户资料'), findsOneWidget);
      expect(find.text('安全'), findsOneWidget);
      expect(find.widgetWithText(TextField, '昵称（用户名，无需唯一）'),
          findsOneWidget);
      expect(find.text('修改密码'), findsOneWidget);
      expect(find.byIcon(Icons.edit_outlined), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    });
  });
}
