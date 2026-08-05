#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-share.sh — 把「程式碼 + 用戶指南」分享去老闆 testing repo（唔放內部文檔）
#
# 機制（2026-08-05 改）：淨係攞 main 而家嘅檔案內容，用 git 底層指令
# （read-tree + commit-tree）砌一個新 commit，parent 接 share repo 自己上一次
# 嗰個 commit —— 唔會再由 main 完整歷史（包括所有內部 docs 嘅過去版本）起。
# main 本身完全唔受影響、唔會 checkout 走。
#
# 舊機制問題：以前每次 checkout -B boss-testing main 都帶埋 main 全部 history，
# 淨係喺最後一個 commit 用 git rm 剝走內部檔案 —— 檔案「表面」剝走咗，但之前
# 全部 commit（帶住完整 docs/CLAUDE.md/AGENTS.md/.claude 內容）仍然一齊
# force-push 咗去 share repo。任何人 `git log` + `git show <舊commit>:docs/xxx`
# 都攞得返完整內容。新機制令 share repo 嘅 history 由頭到尾都唔會有呢啲內容。
#
# 內部 doc/筆記（唔分享）：docs/ 全部（只留 GUIDE-新手使用.md + HANDOVER-HK.md）、CLAUDE.md、AGENTS.md、.claude/
#
# 一次性設定（只做一次）：
#   1. 喺 github.com 開一個新 empty repo（建議 Private，再 invite 老闆）。
#   2. 加 remote（行 443，因為呢個網絡封咗 SSH 22）：
#        git remote add share "ssh://git@ssh.github.com:443/<OWNER>/<REPO>.git"
#
# 之後每次想更新俾老闆：
#        bash scripts/sync-share.sh "今次更新咗咩（一句）"
#
# 如果 share repo 已經有舊機制留低嘅「帶完整 history」版本，要洗一次先：
#        bash scripts/sync-share.sh "今次更新咗咩" --reset-history
#   ⚠️ 呢個 flag 會令新 commit 冇 parent（同 share repo 舊 history 完全切斷）。
#   老闆如果曾經 `git clone` 落自己機，之後要重新 clone 一次先攞到新版
#   （`git pull` 會出現「refusing to merge unrelated histories」）。
#   洗完之後，日常 sync（唔帶呢個 flag）會接返 share 自己嗰條新 history，
#   老闆之後可以正常 `git pull`，唔會再有呢個問題。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

NOTE="${1:-（無備註）}"
RESET_HISTORY=false
[ "${2:-}" = "--reset-history" ] && RESET_HISTORY=true

# 0) 安全檢查
git remote get-url share >/dev/null 2>&1 || { echo "❌ 未設定 'share' remote。先做：git remote add share \"ssh://git@ssh.github.com:443/<OWNER>/<REPO>.git\""; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "❌ 有未 commit 嘅改動，請先 commit/stash 再分享。"; exit 1; }

MAIN_SHA="$(git rev-parse --short main)"
TODAY="$(date +%F)"

# 1) 淨係攞 main 而家嘅檔案內容，喺一個臨時 index 度剝走內部文檔
#    （--cached：只改 index，唔會碰你真正嘅工作目錄 / 唔會 checkout 走 main）
TMP_INDEX="$(mktemp)"
cleanup() { rm -f "$TMP_INDEX"; }
trap cleanup EXIT

GIT_INDEX_FILE="$TMP_INDEX" git read-tree main
GIT_INDEX_FILE="$TMP_INDEX" git rm -q -f -r --cached --ignore-unmatch CLAUDE.md AGENTS.md .claude
# 用 -z + bash case（唔用 grep）過濾 docs/*：git ls-files 對中文檔名預設會做
# octal 轉義/加引號，令 grep '^docs/' 撞唔中 → 漏走中文命名嘅內部文檔（真實撞過
# 嘅 bug：GIT-學習筆記.md、typography-samples/*.jpg 曾經漏剝）。-z 輸出唔會轉義。
while IFS= read -r -d '' f; do
  case "$f" in
    docs/GUIDE-新手使用.md|docs/HANDOVER-HK.md) : ;;
    docs/*) GIT_INDEX_FILE="$TMP_INDEX" git rm -q -f --cached --ignore-unmatch -- "$f" ;;
  esac
done < <(GIT_INDEX_FILE="$TMP_INDEX" git ls-files -z)
NEW_TREE="$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)"

# 2) 決定新 commit 嘅 parent：預設接返 share repo 自己上一次個 commit
#    （令老闆可以正常 git pull）；--reset-history 就唔要 parent（徹底切斷舊 history）。
PARENT_ARGS=()
if [ "$RESET_HISTORY" = false ] && git fetch share main >/dev/null 2>&1; then
  PARENT_ARGS=(-p "$(git rev-parse FETCH_HEAD)")
fi

COMMIT_MSG="share: app code + 用戶指南 only（exclude 內部文檔/筆記）· main@${MAIN_SHA}"
NEW_COMMIT="$(git commit-tree "$NEW_TREE" "${PARENT_ARGS[@]}" -m "$COMMIT_MSG")"

# 3) push 呢個新 commit 去 share repo 嘅 main
git push share "${NEW_COMMIT}:refs/heads/main" --force

# 4) 記錄進度（喺你自己 main 度，唔會分享出去）
echo "- ${TODAY} · main@${MAIN_SHA} · ${NOTE}$([ "$RESET_HISTORY" = true ] && echo ' ⚠️ history reset')" >> docs/SHARE-LOG.md
git add docs/SHARE-LOG.md
git commit -q -m "docs(share-log): 分享 main@${MAIN_SHA} 去老闆 testing repo" >/dev/null 2>&1 || true

echo "✅ 已分享 main@${MAIN_SHA} → share repo（新 commit ${NEW_COMMIT::7}）。"
if [ "$RESET_HISTORY" = true ]; then
  echo "   ⚠️ 呢次洗咗 share repo 嘅舊 history。老闆如果之前 clone 過落機，要提佢重新 clone 一次。"
fi
echo "   進度記錄喺 docs/SHARE-LOG.md。記得 push main 返私人 repo：git push origin main（或 443）。"
