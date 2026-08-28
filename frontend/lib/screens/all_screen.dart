import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../models/item_commitment.dart';
import '../services/api_service.dart';
import '../services/local_mute_store.dart';
import '../widgets/task_row.dart';

/// 「全部」页：分组（进行中/已收口）+ 理由（E2）+ 长按多选硬删（C5/C6）。
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
  final Set<String> _selected = {};

  bool get _selectionMode => _selected.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _api.listItems();
      await LocalMuteStore.instance.mutedIds();
      if (!mounted) return;
      setState(() => _items = items);
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

  bool _isClosed(ItemCommitment item) => item.status == 'done' || item.status == 'abandoned';

  Future<void> _edit(ItemCommitment item) async {
    final titleCtrl = TextEditingController(text: item.title);
    var newCategory = item.category;
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('编辑事项'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: '标题')),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: newCategory,
                decoration: const InputDecoration(labelText: '类目'),
                items: const [
                  DropdownMenuItem(value: 'life', child: Text('生活')),
                  DropdownMenuItem(value: 'chore', child: Text('杂事')),
                  DropdownMenuItem(value: 'bill', child: Text('账单')),
                  DropdownMenuItem(value: 'return', child: Text('退货')),
                  DropdownMenuItem(value: 'study', child: Text('作业')),
                  DropdownMenuItem(value: 'social', child: Text('社交')),
                ],
                onChanged: (v) => setDialogState(() => newCategory = v ?? item.category),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, titleCtrl.text.trim()),
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
    if (title == null || title.isEmpty) return;
    try {
      await _api.patchItem(item.id, title: title, category: newCategory);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已保存'), behavior: SnackBarBehavior.floating));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('保存失败：$e'), behavior: SnackBarBehavior.floating));
      }
    }
    _load();
  }

  Future<void> _deleteSelected() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('将彻底删除选中的 ${_selected.length} 项（不可恢复），确定吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (confirmed != true) return;
    for (final id in _selected.toList()) {
      try {
        await _api.deleteItem(id);
      } catch (_) {}
    }
    setState(() => _selected.clear());
    _load();
  }

  Future<void> _clearArchived() async {
    if (_items.where(_isClosed).isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('清空已收口'),
        content: const Text('已收口事项将从列表隐藏（记录保留用于 Jennifer 校准）。确定吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('清空')),
        ],
      ),
    );
    if (confirmed != true) return;
    // C6/Q16 定案：软归档 = 仅隐藏收口分组（不删除记录，保指标）
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final active = _items.where((i) => !_isClosed(i)).toList();
    final closed = _items.where(_isClosed).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('全部', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    const Text('All commitments · 状态可见，不刷屏', style: TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
              if (_selectionMode)
                IconButton(icon: const Icon(Icons.delete_outline), tooltip: '删除选中', onPressed: _deleteSelected)
              else
                IconButton(icon: const Icon(Icons.delete_sweep_outlined), tooltip: '清空已收口', onPressed: _clearArchived),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _buildList(active, closed),
          ),
        ),
      ],
    );
  }

  Widget _buildList(List<ItemCommitment> active, List<ItemCommitment> closed) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('无法连接后端：$_error'),
            const SizedBox(height: 8),
            FilledButton.tonal(onPressed: _load, child: const Text('重试')),
          ],
        ),
      );
    }
    if (_items.isEmpty) return const Center(child: Text('暂无事项'));
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 18),
      children: [
        _sectionHeader('进行中'),
        for (final item in active) _row(item),
        _sectionHeader('已收口'),
        for (final item in closed) _row(item),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _sectionHeader(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 16, 0, 4),
        child: Text(text, style: const TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.bold)),
      );

  Widget _row(ItemCommitment item) {
    final selected = _selected.contains(item.id);
    return InkWell(
      onTap: () {
        if (_selectionMode) {
          setState(() {
            selected ? _selected.remove(item.id) : _selected.add(item.id);
          });
        } else {
          _edit(item);
        }
      },
      onLongPress: () => setState(() => _selected.add(item.id)),
      child: Container(
        color: selected ? const Color(0xFFFFF0EF) : null,
        child: TaskRow(item: item, reasonText: item.reasonText, onToggle: () => _toggle(item)),
      ),
    );
  }
}
