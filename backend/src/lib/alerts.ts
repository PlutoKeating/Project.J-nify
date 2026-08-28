import net from 'node:net';
import tls from 'node:tls';
import type { Env } from '../config';

export interface AlertConfig {
  enabled: boolean;
  complaintRateThreshold: number;
  degradationRateThreshold: number;
  toEmail: string;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  complaintRateThreshold: 0.1,
  degradationRateThreshold: 0.3,
  toEmail: 'j_nify@yeah.net',
};

export async function sendGitHubIssue(env: Env, title: string, body: string): Promise<boolean> {
  const token = env.GH_PAT;
  if (!token) return false;
  const res = await fetch('https://api.github.com/repos/PlutoKeating/Project.J-nify/issues', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body }),
  });
  return res.ok;
}

/**
 * 最小 SMTP 客户端（nodejs_compat 下的 node:net/tls），仅用于告警邮件。
 * 失败一律返回 false，绝不抛出（告警通道降级不影响主流程）。
 */
export async function sendSmtpMail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT ?? 465);
  const user = env.SMTP_USER;
  const pass = env.SMTP_AUTH;
  if (!host || !user || !pass || !to) return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    let sock: tls.TLSSocket;
    try {
      sock = tls.connect({ host, port, servername: host }, () => {});
    } catch {
      finish(false);
      return;
    }
    sock.setTimeout(15_000);
    sock.on('timeout', () => finish(false));
    sock.on('error', () => finish(false));

    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
    let buf = '';
    let state = 0; // 0:220 1:ehlo250 2:auth334 3:user334 4:pass235 5:mail250 6:rcpt250 7:data354 8:body250 9:done

    const onLine = (line: string) => {
      const code = line.slice(0, 3);
      if (code === '220' && state === 0) {
        sock.write('EHLO jnify.local\r\n');
        state = 1;
      } else if (code === '250' && state === 1) {
        sock.write('AUTH LOGIN\r\n');
        state = 2;
      } else if (code === '334' && state === 2) {
        sock.write(`${b64(user)}\r\n`);
        state = 3;
      } else if (code === '334' && state === 3) {
        sock.write(`${b64(pass)}\r\n`);
        state = 4;
      } else if (code === '235' && state === 4) {
        sock.write(`MAIL FROM:<${user}>\r\n`);
        state = 5;
      } else if (code === '250' && state === 5) {
        sock.write(`RCPT TO:<${to}>\r\n`);
        state = 6;
      } else if (code === '250' && state === 6) {
        sock.write('DATA\r\n');
        state = 7;
      } else if (code === '354' && state === 7) {
        sock.write(`Subject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${html}\r\n.\r\n`);
        state = 8;
      } else if (code === '250' && state === 8) {
        sock.write('QUIT\r\n');
        state = 9;
        finish(true);
        sock.end();
      } else if (code.startsWith('5')) {
        finish(false);
        sock.destroy();
      }
    };

    sock.on('data', (d) => {
      buf += String(d);
      const lines = buf.split('\r\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length) onLine(line);
      }
    });
    sock.on('close', () => finish(false));
  });
}
