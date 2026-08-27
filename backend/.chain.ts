import * as tls from 'node:tls';
import * as fs from 'node:fs';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const socket = tls.connect({ host, port: 6543, servername: host, rejectUnauthorized: false }, () => {
  const certs = socket.getPeerCertificate(true);
  const chain: any[] = [];
  let c: any = certs;
  while (c) { chain.push(c); c = (c.issuerCertificate && c.issuerCertificate !== c) ? c.issuerCertificate : null; }
  const seen = new Set<string>();
  const pem: string[] = [];
  for (const x of chain) {
    const der = x.raw as Buffer;
    const hex = der.toString('hex');
    if (seen.has(hex)) continue;
    seen.add(hex);
    const b64 = der.toString('base64').match(/.{1,64}/g)!.join('\n');
    pem.push(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`);
    console.log(`# ${x.subject?.CN ?? x.subject?.O ?? '?'} <- ${x.issuer?.CN ?? x.issuer?.O ?? '?'}`);
  }
  fs.writeFileSync('certs-tmp.pem', pem.join('\n\n'));
  console.log('wrote', pem.length, 'certs');
  socket.end();
});
socket.on('error', (e) => { console.log('SOCK ERR', e.message); process.exit(1); });
setTimeout(() => process.exit(0), 15000);
