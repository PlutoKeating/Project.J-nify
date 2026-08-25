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
      setState(() {
        _data = data;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _capture(String text) async {
    await _api.capture(text);
    _load();
  }

  Future<void> _decide(String decision) async {
    final item = _data['item'] as Map<String, dynamic>?;
    if (item == null) return;
    await _api.decide(item['id'] as String, decision);
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
    return SingleChildScrollView(
      child: FocusCard(
        item: ItemCommitment.fromJson(item),
        reasonText: item['reason_text'] as String?,
        onDecide: _decide,
      ),
    );
  }
}
