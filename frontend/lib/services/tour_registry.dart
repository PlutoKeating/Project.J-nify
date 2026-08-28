import 'package:shared_preferences/shared_preferences.dart';

/// 通用「新功能引导」注册表（E8 定案）：
/// 每个引导 = key + version + state(completed/skipped)。
/// - 无记录或版本变化 → 应展示；
/// - completed/skipped 同版本 → 不再展示；
/// - 未来新功能发布时 bump version 或换 key，即可向旧用户展示。
class TourRegistry {
  TourRegistry._();

  static final TourRegistry instance = TourRegistry._();

  static const _prefix = 'tour_';

  Future<bool> shouldShow(String key, int version) async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString('$_prefix$key');
    if (raw == null) return true;
    final savedVersion = int.tryParse(raw.split(':').first) ?? -1;
    return savedVersion != version;
  }

  Future<void> mark(String key, int version, {required bool completed}) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString('$_prefix$key', '$version:${completed ? 'completed' : 'skipped'}');
  }

  Future<void> markCompleted(String key, int version) => mark(key, version, completed: true);

  Future<void> markSkipped(String key, int version) => mark(key, version, completed: false);
}
