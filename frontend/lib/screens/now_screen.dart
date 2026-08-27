import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import '../services/api_service.dart';
import '../widgets/capture_input.dart';
import '../widgets/focus_card.dart';

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
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _api.now();
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _capture(String text, String category, DateTime? dueAt) async {
    final res = await _api.capture(text, category: category, dueAt: dueAt);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message'] as String? ?? '记下了：不急，但我帮您盯着。'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(milliseconds: 2200),
        // 顶部居中 pill（SPEC §3.5），与 decision toast 一致
        margin: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top + 12,
          left: 48,
          right: 48,
        ),
      ),
    );
    _load();
  }

  Future<void> _decide(String decision) async {
    final item = _data['item'] as Map<String, dynamic>?;
    if (item == null) return;
    final res = await _api.decide(item['id'] as String, decision);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(res['message'] as String? ?? '已处理'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(milliseconds: 2200),
        // 顶部居中 pill：margin 顶部垫高，贴近 SPEC §3.5
        margin: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top + 12,
          left: 48,
          right: 48,
        ),
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _data['headline'] as String? ?? '现在，只递一件顺手的',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          CaptureInput(onSubmit: _capture),
          const SizedBox(height: 20),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('无法连接后端：$_error'));
    }
    final item = _data['item'] as Map<String, dynamic>?;
    if (item == null) {
      return Center(
        child: Text(_data['empty_message'] as String? ?? '没有必须此刻处理的事'),
      );
    }
    final commitment = ItemCommitment.fromJson(item);
    return SingleChildScrollView(
      child: FocusCard(
        item: commitment,
        reasonText: item['reason_text'] as String?,
        options: commitment.options
            .map((e) => Map<String, String>.from(e as Map))
            .toList(),
        onDecide: _decide,
      ),
    );
  }
}
