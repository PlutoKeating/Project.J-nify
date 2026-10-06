#!/usr/bin/env bash
# 启动或更新 jnify-data（可以重复运行）：第一次生成 .env 与服务密钥，然后构建并启动容器，等它健康。
#   ./start.sh            启动 / 更新
#   ./start.sh --key      打印服务密钥（配置 Workers 的 Secret 时用；只在本机终端显示）
set -euo pipefail
cd "$(dirname "$0")"
umask 077
if [[ ! -f .env ]]; then cp .env.example .env; chmod 600 .env; fi
if ! grep -q '^JNIFY_DATA_KEY=.\{32,\}' .env; then
  key=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)
  sed -i "s/^JNIFY_DATA_KEY=.*/JNIFY_DATA_KEY=$key/" .env
  echo "● 已生成服务密钥（./start.sh --key 查看）"
fi
if [[ ${1:-} == --key ]]; then sed -n 's/^JNIFY_DATA_KEY=//p' .env; exit 0; fi
mkdir -p data && chmod 700 data
# 容器里以 node 用户（uid 1000）运行，数据目录要归它
[[ $(stat -c %u data) == 1000 ]] || { if [[ $EUID -eq 0 ]]; then chown 1000:1000 data; else sudo -n chown 1000:1000 data 2>/dev/null || chown 1000:1000 data 2>/dev/null || true; fi; }
docker compose up -d --build
port=$(sed -n 's/^JNIFY_DATA_LOCAL_PORT=//p' .env); port=${port:-8789}
for i in $(seq 1 30); do
  if curl -fsS -m 3 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then echo "✓ jnify-data 在 127.0.0.1:$port 运行"; exit 0; fi
  sleep 2
done
echo "✗ 60 秒内没有就绪：docker compose logs data" >&2; exit 1
