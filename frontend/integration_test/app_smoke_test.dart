import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:jnify_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('launches to the authentication screen', (tester) async {
    await app.main();
    await tester.pump(const Duration(seconds: 3));

    expect(find.text('J-nify'), findsWidgets);
    expect(find.text('登录'), findsWidgets);
    expect(find.text('邮箱'), findsOneWidget);
  });
}
