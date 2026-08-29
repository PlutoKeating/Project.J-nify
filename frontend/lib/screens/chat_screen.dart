import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import '../core/api/api_client.dart';
import '../services/api_service.dart';
import '../services/conversation_store.dart';

class ChatMessage {
  const ChatMessage({required this.role, required this.content, this.responding = false});

  final String role; // user / assistant
  final String content;
  final bool responding;
}

/// 数据改动卡片：仅活跃会话内展示（纯前端、不落库、不进 LLM 上下文）；
/// 退出 App 或开启新会话后撤销入口即失效（R9）。
class ActionCard {
  const ActionCard({
    required this.actionId,
    required this.tool,
    required this.title,
    this.subtitle,
    required this.afterMessageIndex,
  });

  final String actionId;
  final String tool;
  final String title;
  final String? subtitle;
  final int afterMessageIndex;
}

/// 与 Jennifer 对话（D2/Q7/R5/R9）：自然语言 CRUD + 策略 + 记忆 + 流式输出。
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _api = ApiService(ApiClient.instance);
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final _rand = Random();

  final List<ChatMessage> _messages = [];
  final List<ActionCard> _cards = [];
  bool _busy = false;
  String _sessionId = '';
  String _conversationId = '';
  int _placeholderIndex = -1;
  bool _sentFirst = false;

  String _uuid() {
    final now = DateTime.now().millisecondsSinceEpoch;
    return '${now.toRadixString(16)}-${_rand.nextInt(0x7fffffff).toRadixString(16)}-${_rand.nextInt(0x7fffffff).toRadixString(16)}';
  }

  @override
  void initState() {
    super.initState();
    _conversationId = _uuid();
    _sessionId = _uuid();
    _restore();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _restore() async {
    List<Map<String, Object?>> rows = const [];
    try {
      await ConversationStore.instance.openOrCreate(_conversationId);
      rows = await ConversationStore.instance.loadMessages(_conversationId);
    } catch (_) {
      rows = const [];
    }
    if (!mounted) return;
    setState(() {
      if (rows.isNotEmpty) {
        _messages.addAll(rows.map((r) => ChatMessage(
              role: (r['role'] as String?) ?? 'assistant',
              content: (r['content'] as String?) ?? '',
            )));
      } else {
        _messages.add(const ChatMessage(
          role: 'assistant',
          content: '您好，我是 Jennifer。把想做的事告诉我，或让我帮您调整提醒节奏，我都可以处理。',
        ));
      }
    });
    _scrollToBottom();
  }

  List<Map<String, String>> _history() {
    // 排除刚发送的 user 消息与 responding 占位；最多 12 条。
    final list = <Map<String, String>>[];
    for (var i = 0; i < _messages.length - 2; i++) {
      final m = _messages[i];
      if (m.responding) continue;
      list.add({'role': m.role, 'content': m.content});
    }
    return list.length > 12 ? list.sublist(list.length - 12) : list;
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() {
      _messages.add(ChatMessage(role: 'user', content: text));
      _placeholderIndex = _messages.length;
      _messages.add(const ChatMessage(role: 'assistant', content: '', responding: true));
      _busy = true;
    });
    _controller.clear();
    _scrollToBottom();
    try {
      await ConversationStore.instance.saveMessage(_conversationId, 'user', text);
    } catch (_) {}

    final history = _history();
    final newSession = !_sentFirst;
    _sentFirst = true;
    try {
      await for (final evt
          in _api.chatStream(text, history: history, sessionId: _sessionId, newSession: newSession)) {
        if (!mounted) return;
        final event = (evt['event'] as String?) ?? '';
        final data = (evt['data'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
        switch (event) {
          case 'delta':
            _appendDelta((data['text'] as String?) ?? '');
          case 'done':
            _finishMessage(
              (data['reply'] as String?) ?? '已处理。',
              (data['toolResults'] as List<dynamic>?) ?? const [],
            );
          case 'error':
            _failMessage((data['detail'] as String?) ?? '暂时无法联系 Jennifer，请稍后再试。');
        }
      }
      if (_busy && mounted) {
        _failMessage('连接中断，请稍后再试。');
      }
    } catch (e) {
      if (mounted) _failMessage('暂时无法联系 Jennifer（$e），请稍后再试。');
    }
  }

  void _appendDelta(String delta) {
    if (delta.isEmpty) return;
    setState(() {
      if (_placeholderIndex >= 0 && _placeholderIndex < _messages.length) {
        final prev = _messages[_placeholderIndex];
        _messages[_placeholderIndex] = ChatMessage(role: 'assistant', content: prev.content + delta, responding: true);
      }
    });
    _scrollToBottom();
  }

  void _finishMessage(String reply, List<dynamic> toolResults) {
    setState(() {
      if (_placeholderIndex >= 0 && _placeholderIndex < _messages.length) {
        _messages[_placeholderIndex] = ChatMessage(role: 'assistant', content: reply);
        final index = _placeholderIndex;
        for (final tr in toolResults) {
          if (tr is! Map<String, dynamic>) continue;
          if (tr['ok'] != true) continue;
          final result = tr['result'];
          if (result is! Map<String, dynamic>) continue;
          final actionId = result['action_id'];
          if (actionId is! String || actionId.isEmpty) continue;
          final card = _cardFromTool(tr['tool'] as String? ?? '', result, index);
          if (card != null) _cards.add(card);
        }
        try {
          ConversationStore.instance.saveMessage(_conversationId, 'assistant', reply);
        } catch (_) {}
      }
      _busy = false;
    });
    _scrollToBottom();
  }

  ActionCard? _cardFromTool(String tool, Map<String, dynamic> result, int index) {
    switch (tool) {
      case 'items_create':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '已托付「${result['title'] ?? ''}」',
          subtitle: '类目：${result['category'] ?? '-'}',
          afterMessageIndex: index,
        );
      case 'items_update':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '已更新事项',
          subtitle: '改动已生效，可一键撤销',
          afterMessageIndex: index,
        );
      case 'items_delete':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '已删除「${result['title'] ?? ''}」',
          subtitle: '删除已生效，可一键撤销',
          afterMessageIndex: index,
        );
      case 'rhythm_set':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '提醒节奏已调整',
          subtitle: '类目「${result['category'] ?? '-'}」的策略已生效',
          afterMessageIndex: index,
        );
      case 'guardrails_set':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '护栏已更新',
          subtitle: '安静时段 / 隐私授权已生效',
          afterMessageIndex: index,
        );
      case 'memory_write':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: 'Jennifer 记住了',
          subtitle: result['content']?.toString() ?? '',
          afterMessageIndex: index,
        );
      case 'memory_delete':
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '已遗忘一条记忆',
          subtitle: '删除已生效，可一键撤销',
          afterMessageIndex: index,
        );
      case 'steps_set':
        final steps = (result['steps'] as List<dynamic>?) ?? const [];
        return ActionCard(
          actionId: result['action_id'] as String,
          tool: tool,
          title: '拆解步骤已更新',
          subtitle: '共 ${steps.length} 个小步骤',
          afterMessageIndex: index,
        );
      default:
        return null;
    }
  }

  void _failMessage(String message) {
    setState(() {
      if (_placeholderIndex >= 0 && _placeholderIndex < _messages.length) {
        _messages[_placeholderIndex] = ChatMessage(role: 'assistant', content: message);
      }
      _busy = false;
    });
    _scrollToBottom();
  }

  Future<void> _undo(ActionCard card) async {
    try {
      await _api.undoAgentAction(card.actionId);
      if (!mounted) return;
      setState(() {
        _cards.removeWhere((c) => c.actionId == card.actionId);
      });
      _showToast('已撤销：${card.title}');
    } catch (e) {
      if (mounted) _showToast('撤销失败（$e）');
    }
  }

  void _showToast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 2)));
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
                final cards = _cards.where((c) => c.afterMessageIndex == i).toList();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _MessageBubble(message: m, isUser: m.role == 'user'),
                    ...cards.map((c) => _ActionCardView(card: c, onUndo: () => _undo(c))),
                    const SizedBox(height: 8),
                  ],
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

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isUser});

  final ChatMessage message;
  final bool isUser;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: isUser ? const Color(0xFFFF5A4E) : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: isUser ? null : Border.all(color: const Color(0xFFE8E8E3)),
        ),
        child: isUser
            ? Text(message.content, style: const TextStyle(color: Colors.white))
            : message.responding
                ? const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                      SizedBox(width: 8),
                      Text('Jennifer 正在思考…', style: TextStyle(color: Color(0xFF76767D))),
                    ],
                  )
                : MarkdownBody(
                    data: message.content,
                    styleSheet: MarkdownStyleSheet(
                      p: const TextStyle(fontSize: 14, color: Color(0xFF17171A), height: 1.45),
                    ),
                  ),
      ),
    );
  }
}

class _ActionCardView extends StatelessWidget {
  const _ActionCardView({required this.card, required this.onUndo});

  final ActionCard card;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7F4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF3D3CC)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_outline, color: Color(0xFFFF5A4E), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(card.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                if (card.subtitle != null && card.subtitle!.isNotEmpty)
                  Text(card.subtitle!, style: const TextStyle(fontSize: 12, color: Color(0xFF76767D))),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onUndo,
            icon: const Icon(Icons.undo, size: 16),
            label: const Text('撤销'),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF17171A)),
          ),
        ],
      ),
    );
  }
}
