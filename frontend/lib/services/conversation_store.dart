import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// 会话上下文纯客户端持久化（R4 定案）：只存 user/assistant 文本消息，
/// 不存工具结果卡片、不存占位气泡；服务端无会话表。
class ConversationStore {
  ConversationStore._();

  static final ConversationStore instance = ConversationStore._();

  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'jnify_conversations.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute(
          'CREATE TABLE conversations('
          'id TEXT PRIMARY KEY,'
          'title TEXT,'
          'created_at INTEGER NOT NULL,'
          'updated_at INTEGER NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE messages('
          'id INTEGER PRIMARY KEY AUTOINCREMENT,'
          'conversation_id TEXT NOT NULL,'
          'role TEXT NOT NULL,'
          'content TEXT NOT NULL,'
          'created_at INTEGER NOT NULL)',
        );
        await db.execute(
          'CREATE INDEX idx_messages_conv ON messages(conversation_id, id)',
        );
      },
    );
    return _db!;
  }

  /// 打开（或创建）当前会话；返回会话 id。
  Future<String> openOrCreate(String conversationId) async {
    final db = await _open();
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.insert(
      'conversations',
      {'id': conversationId, 'title': 'Jennifer', 'created_at': now, 'updated_at': now},
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
    return conversationId;
  }

  Future<void> saveMessage(String conversationId, String role, String content) async {
    final db = await _open();
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.insert('messages', {
      'conversation_id': conversationId,
      'role': role,
      'content': content,
      'created_at': now,
    });
    await db.update(
      'conversations',
      {'updated_at': now},
      where: 'id = ?',
      whereArgs: [conversationId],
    );
  }

  Future<List<Map<String, Object?>>> loadMessages(String conversationId) async {
    final db = await _open();
    return db.query(
      'messages',
      where: 'conversation_id = ?',
      whereArgs: [conversationId],
      orderBy: 'id ASC',
    );
  }
}
