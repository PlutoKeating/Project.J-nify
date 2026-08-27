import 'package:flutter/material.dart';

import '../models/item_commitment.dart';

/// 焦点卡：当前唯一「最顺手」窗口，选项闭环（SPEC §2 / §4.3）。
///
/// [options] 由后端 /v1/now 下发（code/label/action_type），按 code 决定按钮样式：
/// `now` 主按钮（accent 实底）、`later` Outlined、`drop` Text、其余（如 rescue）tonal。
/// 空 options 时回退默认三按钮。点击任一按钮回调 [onDecide] 对应 code。
class FocusCard extends StatelessWidget {
  const FocusCard({
    super.key,
    required this.item,
    required this.reasonText,
    required this.onDecide,
    this.options = const [],
  });

  final ItemCommitment item;
  final String? reasonText;
  final ValueChanged<String> onDecide;
  final List<Map<String, String>> options;

  List<Map<String, String>> get _options => options.isEmpty
      ? const [
          {'code': 'now', 'label': '现在做'},
          {'code': 'later', 'label': '晚点，换个窗口'},
          {'code': 'drop', 'label': '这件事算了'},
        ]
      : options;

  Widget _optionButton(Map<String, String> option) {
    const accent = Color(0xFFFF5A4E);
    final code = option['code'] ?? '';
    final label = option['label'] ?? code;
    switch (code) {
      case 'now':
        return SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: accent,
              minimumSize: const Size.fromHeight(54),
            ),
            onPressed: () => onDecide(code),
            child: Text(label),
          ),
        );
      case 'later':
        return SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: () => onDecide(code),
            child: Text(label),
          ),
        );
      case 'drop':
        return TextButton(
          onPressed: () => onDecide(code),
          child: Text(label),
        );
      default:
        // 其余（rescue 等）:tonal 弱强调，点击仍走 onDecide。
        return SizedBox(
          width: double.infinity,
          child: FilledButton.tonal(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: () => onDecide(code),
            child: Text(label),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFFF5A4E);
    final buttons = _options;
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
            for (final (i, option) in buttons.indexed) ...[
              if (i > 0) const SizedBox(height: 8),
              _optionButton(option),
            ],
          ],
        ),
      ),
    );
  }
}