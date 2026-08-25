import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jnify_app/main.dart';

void main() {
  testWidgets('J-nify app renders the bottom navigation shell', (tester) async {
    await tester.pumpWidget(const JnifyApp());
    // The App shell exposes the three-tab NavigationBar (现在/全部/我的).
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
