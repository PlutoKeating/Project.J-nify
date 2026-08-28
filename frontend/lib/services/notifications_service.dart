import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// 本地通知闭环（Q3/F7 定案：执行层本地优先，不引入 Firebase）。
/// 通知内 action「别再提」→ 回调上层做本地永久静默。
class NotificationsService {
  NotificationsService._();

  static final NotificationsService instance = NotificationsService._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  /// 由 App 层注入：itemId → 本地静默（写 muted 存储并同步后端）。
  Future<void> Function(String itemId)? onMuteAction;

  Future<void> init() async {
    if (_initialized) return;
    tzdata.initializeTimeZones();
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {
      tz.setLocalLocation(tz.getLocation('Asia/Shanghai'));
    }
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _plugin.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _onResponse,
    );
    _initialized = true;
  }

  Future<void> _onResponse(NotificationResponse response) async {
    if (response.actionId == 'mute' && response.payload != null) {
      final mute = onMuteAction;
      if (mute != null) await mute(response.payload!);
      return;
    }
    // 点击通知回「现在」页：由 app_links/路由层处理，这里留空。
  }

  Future<bool> requestPermission() async {
    await init();
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) return await android.requestNotificationsPermission() ?? false;
    return true;
  }

  Future<void> showWindowNotification({
    required String title,
    required String body,
    required String itemId,
  }) async {
    await init();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'jennifer_windows',
        'Jennifer 窗口提醒',
        channelDescription: '顺手窗口出现时轻轻提醒您',
        importance: Importance.high,
        priority: Priority.high,
        actions: [AndroidNotificationAction('mute', '别再提')],
      ),
      iOS: DarwinNotificationDetails(),
    );
    await _plugin.show(itemId.hashCode, title, body, details, payload: itemId);
  }
}
