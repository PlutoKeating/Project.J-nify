import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../auth/account.dart';
import '../core/api/api_client.dart';
import '../services/api_service.dart';

/// 设置页：**账户资料（昵称）**、**PlutoKeating 账号**（邮箱、通行密钥、关联 GitHub 都在账号设置页里管理）、删除数据。
/// 由「我的」页的齿轮入口进入。昵称经后端 `/v1/me/profile`。
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

  static String? _currentEmail() => Account.instance.email;

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

  /// 账号设置（邮箱、通行密钥、关联 GitHub、退出）在 PlutoKeating 账号的设置页里，用浏览器打开。
  Future<void> _manageAccount() async {
    final ok = await launchUrl(Uri.parse(Account.settingsUrl), mode: LaunchMode.externalApplication);
    if (!ok) _toast('打不开浏览器');
  }

  Future<void> _deleteAccount() async {
    final confirmCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除我的数据'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('将永久删除您在 J-nify 的全部事项与记录，且无法恢复。请输入「删除」确认。'),
            const SizedBox(height: 8),
            TextField(controller: confirmCtrl, decoration: const InputDecoration(labelText: '输入「删除」')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, confirmCtrl.text.trim() == '删除'),
            child: const Text('确认删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await _api.deleteAllData();
      await Account.instance.signOutLocal();
    } catch (e) {
      _toast('删除失败：$e');
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
          const Divider(),
          _sectionHeader('PlutoKeating 账号'),
          ListTile(
            leading: Icon(Icons.account_circle_outlined, color: colorScheme.primary),
            title: Text(_email ?? '未登录'),
            subtitle: const Text('邮箱、通行密钥、关联 GitHub'),
            trailing: const Icon(Icons.open_in_new),
            onTap: _busy ? null : _manageAccount,
          ),
          const Divider(),
          ListTile(
            leading: Icon(Icons.delete_forever_outlined, color: colorScheme.error),
            title: const Text('删除我的数据'),
            subtitle: const Text('永久删除在 J-nify 的全部事项与记录'),
            onTap: _busy ? null : _deleteAccount,
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
