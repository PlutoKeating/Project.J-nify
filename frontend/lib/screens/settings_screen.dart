import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/api/api_client.dart';
import '../core/config/app_config.dart';
import '../services/api_service.dart';

/// 设置页：单页分组 **账户资料（昵称/邮箱）** + **安全（修改密码）**。
/// 由「我的」页的齿轮入口进入。昵称经后端 `/v1/me/profile`（RLS 下客户端零数据
/// 访问）；邮箱/密码经 Supabase Auth（敏感改动前先重认证当前密码）。
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _api = ApiService(ApiClient.instance);
  final _nicknameCtrl = TextEditingController();

  String _nickname = '';
  String? _email;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nicknameCtrl.dispose();
    super.dispose();
  }

  /// 当前登录邮箱（Supabase Auth）。debug/test 下 Supabase 可能未初始化，整体兜底。
  static String? _currentEmail() {
    try {
      if (!Supabase.instance.isInitialized) return null;
      return Supabase.instance.client.auth.currentUser?.email;
    } catch (_) {
      return null;
    }
  }

  Future<void> _load() async {
    final email = _currentEmail();
    try {
      final profile = await _api.getProfile();
      if (!mounted) return;
      setState(() {
        _email = email;
        _nickname = (profile['nickname'] as String?) ?? '';
        _nicknameCtrl.text = _nickname;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _email = email);
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  Future<void> _saveNickname() async {
    final nickname = _nicknameCtrl.text.trim();
    if (nickname.isEmpty) {
      _toast('昵称不能为空');
      return;
    }
    if (nickname.length > 64) {
      _toast('昵称最长 64 个字符');
      return;
    }
    setState(() => _busy = true);
    try {
      await _api.updateNickname(nickname);
      _toast('昵称已保存');
    } catch (e) {
      _toast('保存失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeEmail() async {
    final newEmail = TextEditingController();
    final password = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改绑定邮箱'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: newEmail,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: '新邮箱'),
            ),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: '当前密码（用于验证）'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('发送确认'),
          ),
        ],
      ),
    );
    if (submitted != true) return;
    final email = newEmail.text.trim();
    final pwd = password.text;
    if (_email == null) {
      _toast('无法获取当前邮箱');
      return;
    }
    if (email.isEmpty) {
      _toast('新邮箱不能为空');
      return;
    }
    setState(() => _busy = true);
    try {
      final auth = Supabase.instance.client.auth;
      // 重认证当前密码（敏感改动前），再更新邮箱 → GoTrue 向新邮箱发确认邮件。
      await auth.signInWithPassword(email: _email!, password: pwd);
      await auth.updateUser(
        UserAttributes(email: email),
        emailRedirectTo: AppConfig.appLinkVerify,
      );
      _toast('确认邮件已发送至新邮箱，请在新邮箱点击确认后重新登录');
    } catch (e) {
      _toast('修改失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final confirm = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改密码'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: current,
              obscureText: true,
              decoration: const InputDecoration(labelText: '当前密码'),
            ),
            TextField(
              controller: next,
              obscureText: true,
              decoration: const InputDecoration(labelText: '新密码'),
            ),
            TextField(
              controller: confirm,
              obscureText: true,
              decoration: const InputDecoration(labelText: '再次输入新密码'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('确认修改'),
          ),
        ],
      ),
    );
    if (submitted != true) return;
    if (_email == null) {
      _toast('无法获取当前邮箱');
      return;
    }
    if (next.text != confirm.text) {
      _toast('两次输入的新密码不一致');
      return;
    }
    if (next.text.isEmpty) {
      _toast('新密码不能为空');
      return;
    }
    setState(() => _busy = true);
    try {
      final auth = Supabase.instance.client.auth;
      await auth.signInWithPassword(email: _email!, password: current.text);
      await auth.updateUser(UserAttributes(password: next.text));
      _toast('密码已修改');
    } catch (e) {
      _toast('修改失败：$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          _sectionHeader('账户资料'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _nicknameCtrl,
              maxLength: 64,
              decoration: const InputDecoration(
                labelText: '昵称（用户名，无需唯一）',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                onPressed: _busy ? null : _saveNickname,
                child: const Text('保存昵称'),
              ),
            ),
          ),
          ListTile(
            title: const Text('邮箱'),
            subtitle: Text(_email ?? '未登录'),
            trailing: IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: '修改邮箱',
              onPressed: _busy ? null : _changeEmail,
            ),
          ),
          const Divider(),
          _sectionHeader('安全'),
          ListTile(
            leading: Icon(Icons.lock_outline, color: colorScheme.primary),
            title: const Text('修改密码'),
            trailing: const Icon(Icons.chevron_right),
            onTap: _busy ? null : _changePassword,
          ),
          const SizedBox(height: 12),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '修改邮箱需在当前密码验证后，前往新邮箱点击确认链接完成，确认后请重新登录。',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleSmall),
      );
}
