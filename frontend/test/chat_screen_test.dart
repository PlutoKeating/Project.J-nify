import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jnify_app/screens/chat_screen.dart';
import 'package:jnify_app/services/api_service.dart';
import 'package:jnify_app/services/conversation_store.dart';

class _FakeChatApi implements JenniferChatApi {
  final controller = StreamController<Map<String, dynamic>>();
  final undoCalls = <String>[];
  List<Map<String, String>> lastHistory = const [];
  bool? lastNewSession;

  @override
  Stream<Map<String, dynamic>> chatStream(
    String message, {
    List<Map<String, String>> history = const [],
    Map<String, dynamic>? context,
    String? sessionId,
    bool newSession = false,
  }) {
    lastHistory = history;
    lastNewSession = newSession;
    return controller.stream;
  }

  @override
  Future<Map<String, dynamic>> undoAgentAction(String actionId) async {
    undoCalls.add(actionId);
    return {'ok': true};
  }
}

class _FakeConversations implements ConversationRepository {
  _FakeConversations({this.initialMessages = const []});

  final List<Map<String, Object?>> initialMessages;
  final saved = <({String role, String content})>[];

  @override
  Future<String> openLatestOrCreate(String suggestedId) async =>
      'restored-conversation';

  @override
  Future<List<Map<String, Object?>>> loadMessages(
          String conversationId) async =>
      initialMessages;

  @override
  Future<void> saveMessage(
      String conversationId, String role, String content) async {
    saved.add((role: role, content: content));
  }
}

void main() {
  testWidgets('restores persisted text messages', (tester) async {
    final conversations = _FakeConversations(initialMessages: const [
      {'role': 'user', 'content': '上次的事项'},
      {'role': 'assistant', 'content': '我还记得。'},
    ]);

    await tester.pumpWidget(MaterialApp(
      home: ChatScreen(
        api: _FakeChatApi(),
        conversations: conversations,
        conversationId: 'new-conversation',
        sessionId: 'session-1',
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('上次的事项'), findsOneWidget);
    expect(find.text('我还记得。'), findsOneWidget);
    expect(find.textContaining('您好，我是 Jennifer'), findsNothing);
  });

  testWidgets('streams text, persists reply, renders action card and undoes it',
      (tester) async {
    final api = _FakeChatApi();
    final conversations = _FakeConversations();
    addTearDown(api.controller.close);

    await tester.pumpWidget(MaterialApp(
      home: ChatScreen(
        api: api,
        conversations: conversations,
        conversationId: 'conversation-1',
        sessionId: 'session-1',
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '帮我记得买牛奶');
    await tester.tap(find.text('发送'));
    await tester.pump();
    expect(find.text('帮我记得买牛奶'), findsOneWidget);
    expect(find.text('Jennifer 正在思考…'), findsOneWidget);

    api.controller.add({
      'event': 'delta',
      'data': {'text': '已经'},
    });
    await tester.pump();
    expect(find.text('已经'), findsOneWidget);

    api.controller.add({
      'event': 'done',
      'data': {
        'reply': '已经为您记下。',
        'toolResults': [
          {
            'tool': 'items_create',
            'ok': true,
            'result': {
              'action_id': 'action-1',
              'title': '买牛奶',
              'category': 'life',
            },
          },
        ],
      },
    });
    await tester.pumpAndSettle();

    expect(find.text('已经为您记下。'), findsOneWidget);
    expect(find.text('已托付「买牛奶」'), findsOneWidget);
    expect(api.lastNewSession, isTrue);
    expect(conversations.saved, contains((role: 'user', content: '帮我记得买牛奶')));
    expect(
        conversations.saved, contains((role: 'assistant', content: '已经为您记下。')));

    await tester.tap(find.text('撤销'));
    await tester.pumpAndSettle();
    expect(api.undoCalls, ['action-1']);
    expect(find.text('已托付「买牛奶」'), findsNothing);
    expect(find.textContaining('已撤销'), findsOneWidget);
  });
}
