import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

abstract interface class ConversationRepository {
  Future<String> openLatestOrCreate(String suggestedId);
  Future<void> saveMessage(String conversationId, String role, String content);
  Future<List<Map<String, Object?>>> loadMessages(String conversationId);
}

/// 会话上下文纯客户端持久化（R4 定案）：只存 user/assistant 文本消息，
/// 不存工具结果卡片、不存占位气泡；服务端无会话表。
class ConversationStore implements ConversationRepository {
  ConversationStore._({DatabaseFactory? databaseFactory, String? databasePath})
      : _databaseFactory = databaseFactory,
        _databasePath = databasePath;

  static final ConversationStore instance = ConversationStore._();

  factory ConversationStore.forTesting({
    required DatabaseFactory databaseFactory,
    required String databasePath,
  }) {
    return ConversationStore._(
      databaseFactory: databaseFactory,
      databasePath: databasePath,
    );
  }

  Database? _db;
  final DatabaseFactory? _databaseFactory;
  final String? _databasePath;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final path = _databasePath ??
        p.join(await getDatabasesPath(), 'jnify_conversations.db');
    final options = OpenDatabaseOptions(
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
    _db = _databaseFactory == null
        ? await openDatabase(
            path,
            version: options.version,
            onCreate: options.onCreate,
          )
        : await _databaseFactory!.openDatabase(path, options: options);
    return _db!;
  }

  /// 恢复最近一次会话；没有历史会话时以 [suggestedId] 创建一个。
  @override
  Future<String> openLatestOrCreate(String suggestedId) async {
    final db = await _open();
    final latest = await db.query(
      'conversations',
      columns: ['id'],
      orderBy: 'updated_at DESC',
      limit: 1,
    );
    if (latest.isNotEmpty) return latest.first['id']! as String;

    final now = DateTime.now().millisecondsSinceEpoch;
    await db.insert(
      'conversations',
      {
        'id': suggestedId,
        'title': 'Jennifer',
        'created_at': now,
        'updated_at': now
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
    return suggestedId;
  }

  @override
  Future<void> saveMessage(
      String conversationId, String role, String content) async {
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

  @override
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
