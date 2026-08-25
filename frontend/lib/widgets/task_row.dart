import 'package:flutter/material.dart';

import '../models/item_commitment.dart';

/// 任务行（SPEC §3.5 Task Row）：勾选圆点 + 标题 + 一句理由 + 状态徽章。
class TaskRow extends StatelessWidget {
  const TaskRow({
    super.key,
    required this.item,
    required this.onToggle,
    this.reasonText,
  });

  final ItemCommitment item;
  final VoidCallback onToggle;
  final String? reasonText;

  String get _badge {
    switch (item.status) {
      case 'window_candidate':
      case 'nudged':
        return '现在顺手';
      case 'deferred':
        return '漂浮';
      case 'rescued':
        return '兜底';
      case 'done':
        return '收口';
      default:
        return '漂浮';
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = item.status == 'done' || item.status == 'abandoned';
    return ListTile(
      leading: IconButton(
        icon: Icon(
          done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: done ? const Color(0xFF35C759) : null,
        ),
        onPressed: onToggle,
      ),
      title: Text(
        item.title,
        style: done ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
      ),
      subtitle: reasonText == null ? null : Text(reasonText!),
      trailing: Chip(
        label: Text(_badge),
        backgroundColor: const Color(0xFFF7F7F4),
        labelStyle: const TextStyle(fontSize: 12, color: Colors.grey),
      ),
    );
  }
}
