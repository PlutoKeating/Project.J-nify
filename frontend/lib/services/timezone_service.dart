import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api/api_client.dart';
import 'api_service.dart';

/// B9：每次启动采集设备时区；与上次记录不同则提示用户确认切换。
class TimezoneService {
  TimezoneService._();

  static final TimezoneService instance = TimezoneService._();

  static const _lastKey = 'last_timezone';

  Future<String> deviceTimezone() async {
    try {
      return await FlutterTimezone.getLocalTimezone();
    } catch (_) {
      return 'UTC';
    }
  }

  Future<String?> lastSaved() async {
    final sp = await SharedPreferences.getInstance();
    return sp.getString(_lastKey);
  }

  Future<void> save(String tz) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_lastKey, tz);
  }

  /// 返回 true 表示需要用户确认（时区变化）；false 表示无需提示。
  Future<bool> detectChange() async {
    final device = await deviceTimezone();
    final last = await lastSaved();
    if (last == null) {
      await save(device);
      return false;
    }
    return last != device;
  }

  Future<void> apply(String tz) async {
    await save(tz);
    try {
      await ApiService(ApiClient.instance).updateTimezone(tz);
    } catch (_) {
      // 静默失败：下次启动再同步
    }
  }
}
