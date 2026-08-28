import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// 登录 / 注册页：邮箱 + 密码，登录与注册可一键切换。
/// 登录成功后 Supabase 会话建立，[AuthGate] 自动切到 [HomeShell]。
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _isSignUp = false;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (email.isEmpty || _password.text.isEmpty) {
      setState(() => _error = '请填写邮箱和密码');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = Supabase.instance.client.auth;
      if (_isSignUp) {
        final r = await auth.signUp(email: email, password: _password.text);
        // 开启邮箱确认时返回 user 但无 session，提示去邮箱确认。
        if (r.user != null && r.session == null) {
          setState(() => _error = '注册成功，请查收邮箱确认链接后登录');
        }
      } else {
        await auth.signInWithPassword(email: email, password: _password.text);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'J-nify · Jennifer',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  '懂 P 人的 J 人助理',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  '不急，但我帮您盯着。',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: '邮箱',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(
                    labelText: '密码',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colorScheme.error),
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(_isSignUp ? '注册' : '登录'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => setState(() {
                    _isSignUp = !_isSignUp;
                    _error = null; // 切模式时清残留错误（评审 Minor）
                  }),
                  child: Text(_isSignUp ? '已有账号？去登录' : '没有账号？注册'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
