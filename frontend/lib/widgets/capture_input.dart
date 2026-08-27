import 'package:flutter/material.dart';

typedef CaptureSubmit = void Function(String text, String category, DateTime? dueAt);

const _categories = [
  ('life', '生活'),
  ('chore', '杂事'),
  ('bill', '账单'),
  ('return', '退货'),
  ('study', '作业'),
  ('social', '社交'),
];

const _dueOptions = [(null, '无期限'), (1, '明天'), (7, '一周'), (14, '两周')];

/// 录入输入框（SPEC §4.3 Capture）：分类 chips + 可选期限 + 黑底「记下」按钮。
class CaptureInput extends StatefulWidget {
  const CaptureInput({super.key, required this.onSubmit});

  final CaptureSubmit onSubmit;

  @override
  State<CaptureInput> createState() => _CaptureInputState();
}

class _CaptureInputState extends State<CaptureInput> {
  final _controller = TextEditingController();
  String _category = 'life';
  int? _dueDays;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final dueAt = _dueDays == null
        ? null
        : DateTime.now().add(Duration(days: _dueDays!));
    widget.onSubmit(text, _category, dueAt);
    _controller.clear();
    setState(() => _dueDays = null);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          children: [
            for (final (code, label) in _categories)
              ChoiceChip(
                label: Text(label),
                selected: _category == code,
                onSelected: (_) => setState(() => _category = code),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: '交给 Jennifer…',
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF17171A),
                minimumSize: const Size(72, 50),
              ),
              onPressed: _submit,
              child: const Text('记下'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          children: [
            for (final (days, label) in _dueOptions)
              ChoiceChip(
                label: Text(label),
                selected: _dueDays == days,
                onSelected: (_) => setState(() => _dueDays = days),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
      ],
    );
  }
}