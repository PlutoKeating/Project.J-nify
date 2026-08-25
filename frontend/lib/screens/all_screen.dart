import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import '../services/api_service.dart';
import '../widgets/task_row.dart';

/// 「全部」页：全部事项，按状态可见，不刷屏（SPEC §4.2 / §4.3）。
class AllScreen extends StatefulWidget {
  const AllScreen({super.key});

  @override
  State<AllScreen> createState() => _AllScreenState();
}

class _AllScreenState extends State<AllScreen> {
  final _api = ApiService(ApiClient.instance);
  List<ItemCommitment> _items = [];
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
      final items = await _api.listItems();
      if (!mounted) return;
      setState(() {
        _items = items;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(ItemCommitment item) async {
    final closed = item.status == 'done' || item.status == 'abandoned';
    await _api.decide(item.id, closed ? 'later' : 'now');
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('全部', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(
            'All commitments · 状态可见，不刷屏',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Expanded(child: _buildList()),
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text('无法连接后端：$_error'));
    if (_items.isEmpty) return const Center(child: Text('暂无事项'));
    return ListView.separated(
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, i) => TaskRow(
        item: _items[i],
        onToggle: () => _toggle(_items[i]),
      ),
    );
  }
}
