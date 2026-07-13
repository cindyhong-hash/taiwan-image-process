#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pack-materials.sh — 打包「本機限定素材」俾 HK dev team（gitignore、唔會經 git 帶走）
#
# 打包內容：
#   - prisma/dev.db            本機示範資料庫（~1 MB）
#   - public/uploads/          上傳 + 生成圖片（~445 MB）
#   - .env.example             環境變數範本（★ 唔含任何真實 key）
#   - docs/HANDOVER-HK.md       HK dev 交接文檔（設定步驟）
#
# ★ 安全：本 script 只打包 .env.example（範本），絕不打包 .env.local（真 key）。
#
# 用法：
#   bash scripts/pack-materials.sh            # 產生 dist/marketing-tool-materials-<日期>.zip
#   bash scripts/pack-materials.sh 20260706   # 自訂日期標籤（因環境唔提供動態時間，可手動傳）
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="${1:-$(date +%Y%m%d 2>/dev/null || echo manual)}"
OUT_DIR="dist"
STAGE="$OUT_DIR/materials-stage"
ZIP="$OUT_DIR/marketing-tool-materials-${STAMP}.zip"

# 0) 安全檢查：唔好手誤打包 .env.local
if [ -f ".env.local" ]; then
  echo "ℹ️  偵測到 .env.local（真 key）—— 本 script 只打包 .env.example，唔會包 .env.local。"
fi

# 1) 準備乾淨 staging 目錄
rm -rf "$STAGE"
mkdir -p "$STAGE/prisma" "$STAGE/public"

# 2) 複製素材（缺就警告，唔中斷）
[ -f prisma/dev.db ]      && cp prisma/dev.db "$STAGE/prisma/dev.db"      || echo "⚠️  搵唔到 prisma/dev.db（跳過）"
[ -d public/uploads ]     && cp -R public/uploads "$STAGE/public/uploads" || echo "⚠️  搵唔到 public/uploads/（跳過）"
[ -f .env.example ]       && cp .env.example "$STAGE/.env.example"        || echo "⚠️  搵唔到 .env.example（跳過）"
[ -f docs/HANDOVER-HK.md ] && cp docs/HANDOVER-HK.md "$STAGE/README-HK-SETUP.md" || echo "⚠️  搵唔到 docs/HANDOVER-HK.md（跳過）"

# 3) 防呆：確保 staging 冇任何真 .env.local 混入
find "$STAGE" -name ".env.local" -delete 2>/dev/null || true

# 4) 打包
mkdir -p "$OUT_DIR"
rm -f "$ZIP"
( cd "$STAGE" && zip -r -q "../$(basename "$ZIP")" . )
rm -rf "$STAGE"

echo ""
echo "✅ 素材包已產生：$ZIP"
du -sh "$ZIP" 2>/dev/null || true
echo ""
echo "內含：prisma/dev.db · public/uploads/ · .env.example · README-HK-SETUP.md"
echo "★ 唔含真實 API key。HK team 解壓後："
echo "   - dev.db → 放入 prisma/"
echo "   - uploads/ → 放入 public/"
echo "   - .env.example → 複製成 .env.local 填真 key"
echo ""
echo "⚠️  dist/ 建議加入 .gitignore（唔好 commit 素材包）。"
