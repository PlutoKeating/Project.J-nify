import 'package:flutter/material.dart';

import '../models/item_commitment.dart';

/// 焦点卡：当前唯一「最顺手」窗口，三选项闭环（SPEC §2 / §4.3）。
class FocusCard extends StatelessWidget {
  const FocusCard({
    super.key,
    required this.item,
    required this.reasonText,
    required this.onDecide,
  });

  final ItemCommitment item;
  final String? reasonText;
  final ValueChanged<String> onDecide;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFFF5A4E);
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '此刻最顺手',
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: accent, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              item.title,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            Text(
              reasonText ?? '我把这件事放在了最顺手的位置。',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey[600]),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: accent,
                  minimumSize: const Size.fromHeight(54),
                ),
                onPressed: () => onDecide('now'),
                child: const Text('现在做'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () => onDecide('later'),
                child: const Text('晚点，换个窗口'),
              ),
            ),
            TextButton(
              onPressed: () => onDecide('drop'),
              child: const Text('这件事算了'),
            ),
          ],
        ),
      ),
    );
  }
}
