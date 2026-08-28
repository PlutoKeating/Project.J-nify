import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.warn('[postbuild] dist/index.html not found; skip 404 fallback');
  process.exit(0);
}

// GitHub Pages 无服务端路由回退：404.html 用 index 克隆，客户端路由读取路径。
writeFileSync(join(dist, '404.html'), readFileSync(index, 'utf8'));
console.log('[postbuild] wrote dist/404.html (SPA fallback)');
