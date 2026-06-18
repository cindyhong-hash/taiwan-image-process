# marketing-tool

社群行銷素材工具（Next.js 16 + React 19 + Prisma/SQLite）。核心係 **素材庫 `/library`**：
- **生成圖片**：積木組合（構圖/配色/語氣/背景）+ 主體/上傳產品圖 → AI 生成圖片(HF) + 文案(OpenRouter)，或去背產品圖合成到背景
- **風格組件**：品牌圖庫（上傳分析圖 + 生成圖）→ 點圖睇 popup、帶入生成、編輯、行業範本一鍵套用

## 文件（重要）
| 檔案 | 內容 |
|------|------|
| [`docs/SETUP.md`](docs/SETUP.md) | 環境變數、token、DB、啟動、備份指令 |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | **換電腦清單**（git 帶 vs 手動複製：dev.db / uploads / .env.local） |
| [`docs/FEATURE_LOG.md`](docs/FEATURE_LOG.md) | 完整功能/變更紀錄 + API 列表 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 關鍵設計決定同理由 |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | 功能檢查清單 + 待增加項目（backlog） |
| [`docs/PLAN-library-redesign.md`](docs/PLAN-library-redesign.md) | 原始素材庫重構實作計劃（plan mode 產出） |

## Getting Started

複製環境變數範本並填入真實 key（見 `.env.example` / `docs/SETUP.md`）：

```bash
cp .env.example .env.local      # 填 OPENROUTER_API_KEY、HF_TOKEN
npm install
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy && npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
