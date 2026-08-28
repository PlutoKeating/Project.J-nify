import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
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
  String _appVersion = AppConfig.appVersion;

  @override
  void initState() {
    super.initState();
    _load();
    _loadAppVersion();
  }

  /// 运行时从已安装包读取版本与构建号（替代写死的 AppConfig.appVersion）。
  Future<void> _loadAppVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() => _appVersion = '${info.version}+${info.buildNumber}');
    } catch (_) {
      // 读取失败时保留 AppConfig 默认版本
    }
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
        // 安静时段：开启即默认 23:30—08:30（后端默认值），关闭存 '00:00' 成对。
        _quietHours =
            (data['quiet_hours_start'] as String? ?? '00:00') != '00:00';
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    await _api.updateGuardrails({
      // 成对提交安静时段：开启 23:30—08:30，关闭 '00:00'。
      'quiet_hours_start': _quietHours ? '23:30' : '00:00',
      'quiet_hours_end': _quietHours ? '08:30' : '00:00',
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
    return SingleChildScrollView(
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
                const Divider(),
                const ListTile(title: Text('关于 J-nify')),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('J-nify 是产品的名字——英文直白意为「P 人变 J」：把计划感偏弱、容易拖延的人，变成更有秩序感的人。'),
                      const SizedBox(height: 8),
                      const Text('Jennifer 是这款 App 里的智能体，也是品牌吉祥物，名字取自 J-nify 对应的「J-nifier」（把 P 人变成 J 的那个人）的谐音，是一位懂 P 人的 J 人助理。'),
                      const SizedBox(height: 12),
                      const Text('“不急，但我帮您盯着。”'),
                      const SizedBox(height: 12),
                      const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('官方网站：'),
                          Flexible(child: SelectableText('https://j-nify.arr2018.dpdns.org')),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('版本：$_appVersion'),
                    ],
                  ),
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
