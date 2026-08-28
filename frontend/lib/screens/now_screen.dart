import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import '../services/api_service.dart';
import '../services/jennifer_local_engine.dart';
import '../services/metrics_reporter.dart';
import '../services/timezone_service.dart';
import '../widgets/capture_input.dart';
import '../widgets/focus_card.dart';
import 'chat_screen.dart';

/// 「现在」页：首屏只给一件此刻最顺手的事（SPEC §2 / §4.3）。
class NowScreen extends StatefulWidget {
  const NowScreen({super.key});

  @override
  State<NowScreen> createState() => _NowScreenState();
}

class _NowScreenState extends State<NowScreen> {
  final _api = ApiService(ApiClient.instance);
  Map<String, dynamic> _data = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _checkTimezone();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      JenniferLocalEngine.instance.maybeNotify();
    });
  }

  Future<void> _checkTimezone() async {
    final changed = await TimezoneService.instance.detectChange();
    if (!changed || !mounted) return;
    final device = await TimezoneService.instance.deviceTimezone();
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('检测到时区变化'),
        content: Text('您的设备时区为 $device，是否切换 Jennifer 的提醒时段？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('保持原时区')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('切换')),
        ],
      ),
    );
    if (ok == true) await TimezoneService.instance.apply(device);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.now();
      if (!mounted) return;
      setState(() => _data = data);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _capture(String text, String category, DateTime? dueAt, int estMinutes) async {
    try {
      final res = await _api.capture(text, category: category, dueAt: dueAt, estMinutes: estMinutes);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message'] as String? ?? '记下了：不急，但我帮您盯着。'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(milliseconds: 2200),
          margin: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 12, left: 48, right: 48),
        ),
      );
      unawaited(MetricsReporter.instance.report(eventType: 'capture', category: category, durationMinutes: estMinutes));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('记下失败：$e，输入内容已保留，请重试'), behavior: SnackBarBehavior.floating),
      );
    }
    _load();
  }

  Future<void> _decide(String decision) async {
    final item = _data['item'] as Map<String, dynamic>?;
    if (item == null) return;
    try {
      final res = await _api.decide(item['id'] as String, decision);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message'] as String? ?? '已处理'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(milliseconds: 2200),
          margin: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 12, left: 48, right: 48),
        ),
      );
      unawaited(MetricsReporter.instance.report(
        eventType: decision == 'rescue' ? 'rescue_action' : 'decision',
        itemId: item['id'] as String?,
        category: item['category'] as String?,
        decision: decision,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('处理失败：$e'), behavior: SnackBarBehavior.floating));
    }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_data['headline'] as String? ?? '现在，只递一件顺手的', style: Theme.of(context).textTheme.headlineMedium),
              ),
              IconButton(
                icon: const Icon(Icons.chat_bubble_outline),
                tooltip: '和 Jennifer 聊聊',
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChatScreen())),
              ),
            ],
          ),
          const SizedBox(height: 12),
          CaptureInput(onSubmit: _capture),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            Center(
              child: Column(
                children: [
                  Text('无法连接后端：$_error'),
                  const SizedBox(height: 8),
                  FilledButton.tonal(onPressed: _load, child: const Text('重试')),
                ],
              ),
            )
          else if (_data['item'] == null)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(child: Text(_data['empty_message'] as String? ?? '没有必须此刻处理的事')),
            )
          else
            FocusCard(
              item: ItemCommitment.fromJson(_data['item'] as Map<String, dynamic>),
              reasonText: (_data['item'] as Map<String, dynamic>)['reason_text'] as String?,
              options: (ItemCommitment.fromJson(_data['item'] as Map<String, dynamic>).options)
                  .map((e) => Map<String, String>.from(e as Map))
                  .toList(),
              onDecide: _decide,
            ),
        ],
      ),
    );
  }
}
