import 'package:shared_preferences/shared_preferences.dart';

/// 本地静默记录（"别再提"一次生效）：与后端 muted_at 同步，本地优先反映。
class LocalMuteStore {
  LocalMuteStore._();

  static final LocalMuteStore instance = LocalMuteStore._();

  static const _key = 'muted_item_ids';

  Future<Set<String>> mutedIds() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getStringList(_key) ?? const [];
    return raw.toSet();
  }

  Future<void> add(String itemId) async {
    final sp = await SharedPreferences.getInstance();
    final ids = await mutedIds();
    ids.add(itemId);
    await sp.setStringList(_key, ids.toList());
  }
}
