import 'package:flutter/material.dart';

import '../services/notifications_service.dart';
import '../services/tour_registry.dart';

/// 首启引导（E8）：通用 feature-tour 框架的第一个用例（onboarding v1）。
/// 完成/跳过状态都会记录，防止二次触发；未来新功能沿用同一机制。
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  static const _key = 'onboarding';
  static const _version = 1;
  int _page = 0;

  static const _pages = [
    ('不急，但我帮您盯着。', '把「不急、但会忘」的小事交给 Jennifer，她会低电量漂浮，在真正顺手的那一刻轻轻提醒您。'),
    ('一句话，交给 Jennifer', '「月底还信用卡」「有空把被子晒了」——说一句就行，不需要先排计划。'),
    ('带理由出现，永远有退路', '每次出现都会告诉您为什么是现在；现在做 / 晚点 / 算了 / 帮我兜底，随您选。'),
  ];

  Future<void> _finish({required bool completed}) async {
    await TourRegistry.instance.mark(_key, _version, completed: completed);
    if (completed) {
      await NotificationsService.instance.requestPermission();
    }
    if (mounted) widget.onFinished();
  }

  @override
  Widget build(BuildContext context) {
    final (title, body) = _pages[_page];
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F4),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text('J-nify · Jennifer', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 24),
              Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 12),
              Text(body, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFF76767D))),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pages.length, (i) => Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i == _page ? const Color(0xFFFF5A4E) : const Color(0xFFE8E8E3),
                  ),
                )),
              ),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF5A4E), minimumSize: const Size.fromHeight(54)),
                onPressed: () {
                  if (_page < _pages.length - 1) {
                    setState(() => _page++);
                  } else {
                    _finish(completed: true);
                  }
                },
                child: Text(_page < _pages.length - 1 ? '下一步' : '开始使用'),
              ),
              TextButton(
                onPressed: () => _finish(completed: false),
                child: const Text('跳过'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
