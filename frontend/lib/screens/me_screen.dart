import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api/api_client.dart';
import '../services/api_service.dart';

/// 「我的」页：护栏（安静时段 / 最小授权 / 提醒上限）+ 隐私说明
/// （SPEC §4.2 / §9.4）。
class MeScreen extends StatefulWidget {
  const MeScreen({super.key});

  @override
  State<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends State<MeScreen> {
  final _api = ApiService(ApiClient.instance);
  bool _loading = true;

  bool _quietHours = false;
  bool _coarseLocation = false;
  int _maxNudge = 3;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _api.guardrails();
      if (!mounted) return;
      final scope = (data['privacy_scope'] as Map<String, dynamic>? ?? {});
      setState(() {
        _maxNudge = data['max_nudge_budget'] as int? ?? 3;
        _coarseLocation = scope['coarse_location'] == true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    await _api.updateGuardrails({
      'max_nudge_budget': _maxNudge,
      'privacy_scope': {'coarse_location': _coarseLocation},
    });
  }

  /// 退出登录：成功后 onAuthStateChange 自动让 [AuthGate] 切回 [LoginScreen]，
  /// 无需手动导航；失败时 SnackBar 提示。
  Future<void> _signOut() async {
    try {
      await Supabase.instance.client.auth.signOut();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('退出登录失败：$e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('我的', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else
            Column(
              children: [
                SwitchListTile(
                  title: const Text('安静时段'),
                  subtitle: const Text('23:30—08:30 不打扰'),
                  value: _quietHours,
                  onChanged: (v) => setState(() {
                    _quietHours = v;
                    _save();
                  }),
                ),
                SwitchListTile(
                  title: const Text('最小授权 · 粗粒度位置'),
                  value: _coarseLocation,
                  onChanged: (v) => setState(() {
                    _coarseLocation = v;
                    _save();
                  }),
                ),
                ListTile(
                  title: const Text('反打扰上限'),
                  subtitle: Text('单事项默认最多 $_maxNudge 次'),
                  trailing: DropdownButton<int>(
                    value: _maxNudge,
                    items: const [
                      DropdownMenuItem(value: 1, child: Text('1')),
                      DropdownMenuItem(value: 2, child: Text('2')),
                      DropdownMenuItem(value: 3, child: Text('3')),
                    ],
                    onChanged: (v) => setState(() {
                      _maxNudge = v ?? 3;
                      _save();
                    }),
                  ),
                ),
                const Divider(),
                const ListTile(
                  title: Text('隐私说明'),
                  subtitle: Text('数据仅本地缓存；位置仅粗粒度；不采集精确轨迹。'),
                ),
              ],
            ),
          const SizedBox(height: 12),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('退出登录'),
            onTap: _signOut,
          ),
        ],
      ),
    );
  }
}
