import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../services/api_service.dart';
import 'settings_screen.dart';

/// 「我的」页：用户资料卡 + 护栏（安静时段 / 最小授权 / 提醒上限）
/// + 可折叠的「隐私说明」「关于 J-nify」（SPEC §4.2 / §9.4）。
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

  String _nickname = '';
  String? _email;

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
    await _loadGuardrails();
    await _loadProfile();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadGuardrails() async {
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
      });
    } catch (_) {
      // 护栏读取失败不阻塞页面（保留默认值）。
    }
  }

  /// 当前登录邮箱（来自 Supabase Auth）。debug/test 下 Supabase 可能未初始化，
  /// 整体 try/catch 兜底，与 [ApiClient] 的处理一致。
  static String? _currentEmail() {
    try {
      if (!Supabase.instance.isInitialized) return null;
      return Supabase.instance.client.auth.currentUser?.email;
    } catch (_) {
      return null;
    }
  }

  /// 刷新资料（昵称/邮箱）。从设置页返回后调用，避免整页转圈。
  Future<void> _loadProfile() async {
    // 邮箱来自 Supabase Auth；昵称来自后端 users 表。
    final email = _currentEmail();
    try {
      final profile = await _api.getProfile();
      if (!mounted) return;
      setState(() {
        _email = email;
        _nickname = (profile['nickname'] as String?) ?? '';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _email = email);
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

  void _openSettings() {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const SettingsScreen()))
        // 从设置页返回后刷新资料卡（昵称/邮箱可能已变）。
        .then((_) => _loadProfile());
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
    final colorScheme = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: colorScheme.primary.withValues(alpha: 0.12),
                child: Icon(Icons.person, size: 30, color: colorScheme.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _nickname.isEmpty ? '未设置昵称' : _nickname,
                      style: Theme.of(context).textTheme.titleLarge,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      _email ?? '未登录',
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                tooltip: '设置',
                onPressed: _openSettings,
              ),
            ],
          ),
          const Divider(height: 24),
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
                const Divider(),
                const ExpansionTile(
                  key: ValueKey('privacy'),
                  title: Text('隐私说明'),
                  initiallyExpanded: false,
                  children: [
                    Padding(
                      padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Text('原始信号（屏幕使用/日历/位置/天气上下文）仅在本机处理、不上传；事项与决策记录加密存储于云端，仅您本人可访问；位置坐标先模糊化再使用；可随时删除全部数据。'),
                    ),
                  ],
                ),
                const Divider(),
                ExpansionTile(
                  key: const ValueKey('about'),
                  title: const Text('关于 J-nify'),
                  initiallyExpanded: false,
                  children: [
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
                          const SizedBox(height: 12),
                          const Text('天气数据由 OpenWeather 提供（Weather by OpenWeather）'),
                        ],
                      ),
                    ),
                  ],
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
