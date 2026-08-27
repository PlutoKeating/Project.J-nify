import * as net from 'node:net';
import * as tls from 'node:tls';
import * as fs from 'node:fs';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const s = net.connect(6543, host);
s.on('connect', () => {
  const buf = Buffer.alloc(8);
  buf.writeInt32BE(8, 0);
  buf.writeInt32BE(80877103, 4);
  s.write(buf);
});
s.on('error', (e) => { console.log('NET ERR', e.message); process.exit(1); });
s.on('data', (d) => {
  if (d[0] === 0x53) { // 'S'
    const t = new tls.TLSSocket(s, { servername: host, rejectUnauthorized: false });
    t.on('secureConnect', () => {
      const certs = t.getPeerCertificate(true);
      const chain: any[] = [];
      let c: any = certs;
      const seen = new Set<string>();
      while (c) {
        const hex = Buffer.from(c.raw).toString('hex');
        if (!seen.has(hex)) { seen.add(hex); chain.push(c); }
        c = (c.issuerCertificate && c.issuerCertificate !== c) ? c.issuerCertificate : null;
      }
      const pem: string[] = [];
      for (const x of chain) {
        const der = Buffer.from(x.raw);
        const b64 = der.toString('base64').match(/.{1,64}/g)!.join('\n');
        pem.push(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`);
        console.log(`# ${x.subject?.CN ?? x.subject?.O ?? '?'} <- ${x.issuer?.CN ?? x.issuer?.O ?? '?'} (serial ${x.serialNumber?.slice(0, 12) ?? '?'})`);
      }
      fs.writeFileSync('certs-tmp.pem', pem.join('\n\n'));
      console.log('wrote', pem.length, 'certs');
      process.exit(0);
    });
    t.on('error', (e) => { console.log('TLS ERR', e.message); process.exit(1); });
  } else {
    console.log('unexpected resp', d.toString('hex'));
    process.exit(1);
  }
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
