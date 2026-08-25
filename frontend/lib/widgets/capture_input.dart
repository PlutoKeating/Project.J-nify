import 'package:flutter/material.dart';

/// 录入输入框（SPEC §4.3 Capture）：黑底「记下」按钮，录入后仅确认、不逼计划。
class CaptureInput extends StatefulWidget {
  const CaptureInput({super.key, required this.onSubmit});

  final ValueChanged<String> onSubmit;

  @override
  State<CaptureInput> createState() => _CaptureInputState();
}

class _CaptureInputState extends State<CaptureInput> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSubmit(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}
