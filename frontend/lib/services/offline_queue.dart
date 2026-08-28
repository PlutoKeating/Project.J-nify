import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// 弱网离线队列（E4 完整落地）：capture/decision/profile 等写操作离线暂存，
/// 重连后按序重放（last-write-wins，冲突策略见 GAP-OFFLINE-CLOUD）。
class OfflineQueue {
  OfflineQueue._();

  static final OfflineQueue instance = OfflineQueue._();

  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'jnify_offline.db'),
      version: 1,
      onCreate: (db, _) => db.execute(
        'CREATE TABLE queue('
        'id INTEGER PRIMARY KEY AUTOINCREMENT,'
        'method TEXT NOT NULL,'
        'path TEXT NOT NULL,'
        'body TEXT,'
        'created_at INTEGER NOT NULL)',
      ),
    );
    return _db!;
  }

  Future<void> enqueue(String method, String path, Map<String, dynamic>? body) async {
    final db = await _open();
    await db.insert('queue', {
      'method': method,
      'path': path,
      'body': body == null ? null : jsonEncode(body),
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<List<Map<String, Object?>>> pending() async {
    final db = await _open();
    return db.query('queue', orderBy: 'id ASC');
  }

  Future<void> remove(int id) async {
    final db = await _open();
    await db.delete('queue', where: 'id = ?', whereArgs: [id]);
  }

  Future<int> count() async {
    final db = await _open();
    final rows = await db.rawQuery('SELECT COUNT(*) AS c FROM queue');
    return (rows.first['c'] as int?) ?? 0;
  }
}
