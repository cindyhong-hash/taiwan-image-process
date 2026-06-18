#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-share.sh — 把「程式碼 + 用戶指南」分享去老闆 testing repo（唔放內部文檔）
#
# 機制：每次由最新 main 重建 `boss-testing` 分支 → 剝走內部 doc/筆記 → force-push
#       去 `share` remote 嘅 main。main 本身完全唔受影響。
#
# 內部 doc/筆記（唔分享）：docs/ 全部（只留 GUIDE-新手使用.md）、CLAUDE.md、AGENTS.md、.claude/
#
# 一次性設定（只做一次）：
#   1. 喺 github.com 開一個新 empty repo（建議 Private，再 invite 老闆）。
#   2. 加 remote（行 443，因為呢個網絡封咗 SSH 22）：
#        git remote add share "ssh://git@ssh.github.com:443/<OWNER>/<REPO>.git"
#
# 之後每次想更新俾老闆：
#        bash scripts/sync-share.sh "今次更新咗咩（一句）"
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

NOTE="${1:-（無備註）}"

# 0) 安全檢查
git remote get-url share >/dev/null 2>&1 || { echo "❌ 未設定 'share' remote。先做：git remote add share \"ssh://git@ssh.github.com:443/<OWNER>/<REPO>.git\""; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "❌ 有未 commit 嘅改動，請先 commit/stash 再分享。"; exit 1; }
git checkout main >/dev/null 2>&1

MAIN_SHA="$(git rev-parse --short main)"
TODAY="$(date +%F)"

# 1) 由 main 重建 boss-testing 分支
git checkout -B boss-testing main >/dev/null 2>&1

# 2) 剝走內部 doc/筆記（只留 user guide）
git rm -q -r --ignore-unmatch CLAUDE.md AGENTS.md .claude >/dev/null 2>&1 || true
find docs -type f ! -name 'GUIDE-新手使用.md' -print0 2>/dev/null | xargs -0 --no-run-if-empty git rm -q --ignore-unmatch >/dev/null 2>&1 || true
git commit -q -m "share: app code + 用戶指南 only（exclude 內部文檔/筆記）· main@${MAIN_SHA}" >/dev/null 2>&1 || true

# 3) force-push 去 share repo 嘅 main（testing 鏡像，唔保留 history）
git push share boss-testing:main --force

# 4) 返 main + 記錄進度
git checkout main >/dev/null 2>&1
echo "- ${TODAY} · main@${MAIN_SHA} · ${NOTE}" >> docs/SHARE-LOG.md
git add docs/SHARE-LOG.md >/dev/null 2>&1
git commit -q -m "docs(share-log): 分享 main@${MAIN_SHA} 去老闆 testing repo" >/dev/null 2>&1 || true

echo "✅ 已分享 main@${MAIN_SHA} → share repo（boss-testing→main）。"
echo "   進度記錄喺 docs/SHARE-LOG.md。記得 push main 返私人 repo：git push origin main（或 443）。"
