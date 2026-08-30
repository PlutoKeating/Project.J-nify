import 'package:flutter_test/flutter_test.dart';
import 'package:jnify_app/services/conversation_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();

  test('restores the latest conversation and its ordered text messages',
      () async {
    final store = ConversationStore.forTesting(
      databaseFactory: databaseFactoryFfiNoIsolate,
      databasePath: inMemoryDatabasePath,
    );

    expect(await store.openLatestOrCreate('conversation-1'), 'conversation-1');
    await store.saveMessage('conversation-1', 'user', '记得买牛奶');
    await store.saveMessage('conversation-1', 'assistant', '记下了。');

    expect(await store.openLatestOrCreate('conversation-2'), 'conversation-1');
    final messages = await store.loadMessages('conversation-1');
    expect(messages.map((row) => row['role']), ['user', 'assistant']);
    expect(messages.map((row) => row['content']), ['记得买牛奶', '记下了。']);
  });
}
