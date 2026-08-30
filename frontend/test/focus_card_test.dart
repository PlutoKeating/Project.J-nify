import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jnify_app/models/item_commitment.dart';
import 'package:jnify_app/widgets/focus_card.dart';

/// 纯 widget 测试：FocusCard 按后端 options 渲染（含 rescue），不触网。
void main() {
  testWidgets('renders dynamic options incl rescue', (tester) async {
    const item = ItemCommitment(
      id: '1',
      title: '晒被子',
      category: 'chore',
      status: 'parked',
    );
    final codes = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: FocusCard(
          item: item,
          reasonText: '天气合适',
          options: const [
            {'code': 'now', 'label': '现在做', 'action_type': 'do'},
            {'code': 'later', 'label': '晚点，换个窗口', 'action_type': 'defer'},
            {'code': 'drop', 'label': '这件事算了', 'action_type': 'drop'},
            {'code': 'rescue', 'label': '帮我兜底', 'action_type': 'rescue'},
          ],
          onDecide: codes.add,
        ),
      ),
    ));
    expect(find.text('帮我兜底'), findsOneWidget);
    await tester.tap(find.text('现在做'));
    expect(codes, ['now']);
  });

  testWidgets('falls back to default three buttons when options empty',
      (tester) async {
    const item = ItemCommitment(
      id: '2',
      title: '交水费',
      category: 'bill',
      status: 'parked',
    );
    final codes = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: FocusCard(
          item: item,
          reasonText: '顺手',
          onDecide: codes.add,
        ),
      ),
    ));
    expect(find.text('现在做'), findsOneWidget);
    expect(find.text('晚点，换个窗口'), findsOneWidget);
    expect(find.text('这件事算了'), findsOneWidget);
    await tester.tap(find.text('晚点，换个窗口'));
    expect(codes, ['later']);
  });
}
