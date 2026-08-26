import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error('DIRECT_DATABASE_URL is required');
  process.exit(1);
}
const dir = join(process.cwd(), 'supabase', 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const sql = postgres(url, { prepare: false, ssl: 'require' });
for (const f of files) {
  const body = await readFile(join(dir, f), 'utf8');
  console.log(`applying ${f}...`);
  await sql.unsafe(body);
}
await sql.end();
console.log('migrations applied');