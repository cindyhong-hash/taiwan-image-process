#!/usr/bin/env bash
# slim-uploads.sh — 安全瘦身 public/uploads/
#
# 做法（可還原，唔會 rm）：
#   1. 從 prisma/dev.db 抽出「任何地方出現過」的圖片檔名 → 當作 in-use（保守，寧多勿少）
#   2. uploads 入面唔喺呢個清單嘅檔 = orphan → 搬去 .backup/uploads-orphans-<日期>/
#   3. 你自己 test 過 /library 同各頁正常後，過幾日再人手刪 .backup
#
# 用法：
#   bash scripts/slim-uploads.sh           # dry-run，只列出會搬咩，唔郁檔
#   bash scripts/slim-uploads.sh --apply   # 真正搬去隔離區
set -euo pipefail

cd "$(dirname "$0")/.."   # 專案根目錄

UPLOADS="public/uploads"
DB="prisma/dev.db"
STAMP="$(date +%Y%m%d-%H%M%S)"
QUARANTINE=".backup/uploads-orphans-${STAMP}"
APPLY="${1:-}"

[ -d "$UPLOADS" ] || { echo "找唔到 $UPLOADS"; exit 1; }
[ -f "$DB" ]      || { echo "找唔到 $DB"; exit 1; }

# 1) 抽出 DB 入面所有圖片檔名（UUID.ext）。strings 對 SQLite blob/text 都 work，
#    唔需要 sqlite3，亦唔受 schema 欄位影響（最保守）。
echo "→ 掃描 $DB 嘅圖片引用…"
strings "$DB" \
  | grep -oiE '[0-9a-f-]{8,}\.(png|jpe?g|webp|avif)' \
  | sort -u > /tmp/uploads_referenced.txt
REF_COUNT=$(wc -l < /tmp/uploads_referenced.txt | tr -d ' ')
echo "  被引用（in-use）：$REF_COUNT 個檔名"

# 2) 逐個 uploads 檔案比對
total=0; orphan=0; orphan_bytes=0
mkdir -p "$QUARANTINE"
ORPHAN_LIST="$QUARANTINE/orphan-list.txt"
: > "$ORPHAN_LIST"

while IFS= read -r f; do
  total=$((total+1))
  base="$(basename "$f")"
  if grep -qiF "$base" /tmp/uploads_referenced.txt; then
    continue   # in-use，保留
  fi
  orphan=$((orphan+1))
  sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
  orphan_bytes=$((orphan_bytes+sz))
  echo "$base" >> "$ORPHAN_LIST"
  if [ "$APPLY" = "--apply" ]; then
    mv "$f" "$QUARANTINE/"
  fi
done < <(find "$UPLOADS" -type f)

orphan_mb=$((orphan_bytes/1024/1024))
echo ""
echo "==== 結果 ===="
echo "uploads 總檔數     ：$total"
echo "保留（in-use）     ：$((total-orphan))"
echo "Orphan             ：$orphan（約 ${orphan_mb} MB）"
echo "Orphan 清單        ：$ORPHAN_LIST"
if [ "$APPLY" = "--apply" ]; then
  echo "已搬去隔離區       ：$QUARANTINE"
  echo "→ test 過 /library 正常後，可手動：rm -rf $QUARANTINE"
else
  rm -rf "$QUARANTINE"   # dry-run 唔留空資料夾
  echo "（dry-run，未郁任何檔。加 --apply 先真正搬。）"
fi
