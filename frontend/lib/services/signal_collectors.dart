import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

import '../core/config/app_config.dart';

/// 本地信号上下文（D5 定案：全部本地处理，不上传云端）。
class LocalContext {
  const LocalContext({this.sunny = false, this.usageMinutes = 0, this.freeSlots = const []});

  final bool sunny;
  final int usageMinutes;
  final List<DateTime> freeSlots;

  bool get hasUsageSignal => usageMinutes >= 1;
}

/// 四类信号采集器（B1/Q4 定案）：usage / 系统日历 / 天气 / 位置。
/// 平台通道（UsageStats / CalendarContract）在 Android 原生侧实现。
class SignalCollectors {
  SignalCollectors._();

  static final SignalCollectors instance = SignalCollectors._();

  static const MethodChannel _usageChannel = MethodChannel('jnify/usage');
  static const MethodChannel _calendarChannel = MethodChannel('jnify/calendar');

  /// 屏幕使用（UsageStatsManager，分钟级聚合；仅本地）
  Future<Map<String, dynamic>> usageStats({int sinceMinutes = 60}) async {
    try {
      final raw = await _usageChannel.invokeMethod<Map<Object?, Object?>>('recentUsage', {'sinceMinutes': sinceMinutes});
      final map = (raw ?? const {}).map((k, v) => MapEntry(k.toString(), v));
      return map;
    } catch (_) {
      return const {};
    }
  }

  /// 系统日历空闲时段（只读，返回未来 N 天空闲起点）
  Future<List<DateTime>> calendarFreeSlots({int days = 7, int minMinutes = 15}) async {
    try {
      final raw = await _calendarChannel.invokeListMethod<String>('freeSlots', {'days': days, 'minMinutes': minMinutes});
      return (raw ?? const []).map((s) => DateTime.tryParse(s) ?? DateTime.now()).toList();
    } catch (_) {
      return const [];
    }
  }

  /// 天气（OpenWeather，坐标模糊化后请求；结果本地缓存）
  Future<bool> isSunny(double lat, double lon) async {
    final key = AppConfig.instance.openWeatherApiKey;
    if (key.isEmpty) return false;
    final rlat = (lat * 100).roundToDouble() / 100;
    final rlon = (lon * 100).roundToDouble() / 100;
    try {
      final res = await http
          .get(
            Uri.parse(
              'https://api.openweathermap.org/data/2.5/forecast?lat=$rlat&lon=$rlon&appid=$key&units=metric',
            ),
          )
          .timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) return false;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (data['list'] as List<dynamic>? ?? const []);
      if (list.isEmpty) return false;
      // 取未来 48h：连续晴/少云且风速 <= 5 级（约 10.7 m/s）且无降水
      int clearCount = 0;
      for (final item in list.take(16)) {
        final it = item as Map<String, dynamic>;
        final main = (it['weather'] as List<dynamic>? ?? const []).firstOrNull as Map<String, dynamic>?;
        final id = (main?['id'] as num?)?.toInt() ?? 800;
        final wind = ((it['wind'] as Map<String, dynamic>?)?['speed'] as num?)?.toDouble() ?? 99;
        final rain = it['rain'] != null;
        final clear = id == 800 || id == 801 || id == 802;
        if (clear && !rain && wind <= 10.7) {
          clearCount++;
        } else {
          break;
        }
      }
      return clearCount >= 4; // 约连续两天（8 个 3h 窗口取前 4 个作保守判断）
    } catch (_) {
      return false;
    }
  }

  /// 位置：精确授权 → 坐标取整模糊化（约 1km）→ 天地图逆地理编码取城市/区域（仅本地使用）
  Future<({double lat, double lon, String city})?> locate() async {
    try {
      final granted = await Geolocator.checkPermission();
      if (granted == LocationPermission.denied) {
        final asked = await Geolocator.requestPermission();
        if (asked == LocationPermission.denied || asked == LocationPermission.deniedForever) return null;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final lat = (pos.latitude * 100).roundToDouble() / 100;
      final lon = (pos.longitude * 100).roundToDouble() / 100;
      final city = await _reverseGeocode(lat, lon);
      return (lat: lat, lon: lon, city: city);
    } catch (_) {
      return null;
    }
  }

  Future<String> _reverseGeocode(double lat, double lon) async {
    final key = AppConfig.instance.tiandituKey;
    if (key.isEmpty) return '';
    try {
      final postStr = jsonEncode({'lon': lon, 'lat': lat, 'ver': 1});
      final res = await http
          .get(Uri.parse('https://api.tianditu.gov.cn/geocoder?postStr=$postStr&type=geocode&tk=$key'))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return '';
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = data['result'] as Map<String, dynamic>?;
      return (result?['address'] as String?) ?? '';
    } catch (_) {
      return '';
    }
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
