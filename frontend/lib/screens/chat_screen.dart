import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../services/api_service.dart';

class ChatMessage {
  const ChatMessage({required this.role, required this.content});

  final String role; // user / assistant
  final String content;
}

/// 与 Jennifer 对话（D2/Q7 定案）：自然语言对全部事项增删改查与统筹。
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _api = ApiService(ApiClient.instance);
  final _controller = TextEditingController();
  final List<ChatMessage> _messages = [
    const ChatMessage(role: 'assistant', content: '您好，我是 Jennifer。把想做的事告诉我，或让我帮您调整提醒节奏，我都可以处理。'),
  ];
  bool _busy = false;
  final _scroll = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() {
      _messages.add(ChatMessage(role: 'user', content: text));
      _busy = true;
    });
    _controller.clear();
    _scrollToBottom();
    try {
      final history = _messages
          .where((m) => m.role != 'user' || m != _messages.last)
          .take(_messages.length - 1)
          .map((m) => {'role': m.role, 'content': m.content})
          .toList();
      final res = await _api.chat(text, history: history.cast<Map<String, String>>());
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: (res['reply'] as String?) ?? '已处理。'));
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: '暂时无法联系 Jennifer（$e），请稍后再试。'));
        _busy = false;
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Jennifer')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, i) {
                final m = _messages[i];
                final isUser = m.role == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    constraints: const BoxConstraints(maxWidth: 300),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFFFF5A4E) : Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: isUser ? null : Border.all(color: const Color(0xFFE8E8E3)),
                    ),
                    child: Text(m.content, style: TextStyle(color: isUser ? Colors.white : const Color(0xFF17171A))),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      onSubmitted: (_) => _send(),
                      decoration: const InputDecoration(
                        hintText: '交给 Jennifer…',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(20)), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: _busy ? null : _send, child: const Text('发送')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
