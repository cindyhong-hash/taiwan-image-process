# AI Design P3 Vision Art Direction Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, inline in the current session. Steps use checkbox syntax. Do not dispatch subagents.

**Goal:** 讓視覺模型選擇 P2 已實作的有限設計策略，產生可追查、可降級的三套可編輯設計。

**Architecture:** 安全判讀先過濾素材，art-direction 模組再輸出受限 JSON；policy 限制身份素材與能力邊界，P2 planner/render/quality 完成實際構圖。過往貼文由本次使用者指定，非必填；provider 故障回 P2。

**Tech Stack:** TypeScript、Next.js、React、sharp、OpenRouter 現有介面、Node test。

**Spec:** `docs/superpowers/specs/2026-09-09-ai-design-p2-p3-continuation.md`

## Global Constraints

- 先完成 `docs/superpowers/plans/2026-09-09-ai-design-p2-foundation-completion.md` 的 P2.1／P2.2 驗收。
- 不改商品生圖核心、登入 proxy、靈感與 activities 建立圖文主流程。
- 沿用 ML_WIZARD_SEED_KEY 的 `{ layers, docW, docH, clientId }`。
- 不新增生圖成本；P4、歷史貼文自動搜尋、品牌學習持久快取、完整人工美術編輯器均不在此案。
- 模型與素材載入錯誤不暴露供應商詳細訊息、金鑰或圖片 data URI。
- 於目前 session inline 執行；不使用 subagent。
- 不自動 push、merge、部署。功能預設以 `AD_LAYOUT_ART_DIRECTION_ENABLED=false` 關閉，驗收通過後由部署設定啟用。

## Task 1 — 決策契約、嚴格 parser 與 policy

**Files:** 新增 `src/lib/magic-layers/ad-layout-art-direction.ts`、`ad-layout-art-direction.test.ts`、`ad-layout-art-direction-policy.ts`、`ad-layout-art-direction-policy.test.ts`。

**Interfaces:**
```ts
export type DirectionDecision = {
  direction: "product-focus" | "editorial" | "scene-led";
  composition: "copy-left" | "copy-right" | "stacked";
  typography: "bold" | "balanced" | "quiet";
  density: "minimal" | "balanced";
  support: "none" | "detail" | "benefit";
  decoration: "none" | "one";
  accent: "primary" | "secondary";
  graphics: "none" | "benefit-group";
  backdrop: "none" | "light-fade" | "dark-fade";
  confidence: number;
};
export type ArtDirectionDecision = { version: 1; directions: DirectionDecision[] };
export function parseArtDirection(text: string): ArtDirectionDecision | null;
```
`applyArtDirectionPolicy(brief, inventory, decision)` 回經過限制的決策；不讓模型碰 URL、商品本體或任意 x/y。

- [ ] 寫 parser 測試，至少包含：
```ts
assert.equal(parseArtDirection('{"version":1,"directions":[]}'), null);
assert.equal(parseArtDirection('{"version":1,"url":"https://example.com","directions":[]}'), null);
```
再用完整合法三方向 fixture 測 pass，對該 fixture 逐一注入 x/y、未知 preset、重複方向、缺方向、NaN 替代值、超長回應確認拒絕。
- [ ] 跑 art-direction 測試確認 red。parser 限輸出 16KB、精確 key allowlist、三方向各一、confidence 0..1，支援一層 JSON code fence，其餘不做猜測性修補。
- [ ] policy：confidence < 0.7 該方向不用模型；缺素材角色不得引用；hero/logo immutable；benefit-group 只能用本次已確認賣點；secondary 不存在退 primary；選 benefit-group 時取消 support。
- [ ] 寫測試確認安全判讀省略的資產不復活、未知功效不得新增、超出 P2 能力拒絕。執行測試及 eslint，提交 `feat(design): validate bounded art-direction decisions`。

## Task 2 — 同品牌參考貼文選取

**Files:** 新增 `src/lib/magic-layers/ad-layout-references.ts`、`ad-layout-references.test.ts`、`src/app/api/products/[productId]/design-references/route.ts`；修改 `src/components/adcreation/AdLayoutModal.tsx`、`src/app/api/magic-layers/ad-layout/route.ts`。

**Interfaces:** `selectDesignReferences(available: string[], selected: string[]): string[]` 僅接受 available 中的 URL；最多二個，不默默取前二張。API GET 以 product.clientId 載入該品牌 pastPostImageUrls，回 `{ references: [{ url }] }`；POST ad-layout 的新欄位 `referenceUrls?: string[]` 預設空。

- [ ] 寫允許清單、重複、跨品牌、任意外部 URL、超過兩張、空清單測試：
```ts
assert.deepEqual(selectDesignReferences(["brand-a"], []), []);
assert.throws(() => selectDesignReferences(["brand-a"], ["brand-b"]));
```
- [ ] 跑 references 測試確認 red。GET/POST 沿用既有存取控制與 product/client 一致性檢查；POST 重新讀品牌資料驗證，避免 UI 清單過期或篡改。無效選擇回 400 提示重選，不傳送圖片。
- [ ] Modal 增加收合的「參考品牌貼文（選填，最多 2 張）」區，預設未選；顯示選取狀態、可取消與載入失敗訊息。說明選取圖片將交由視覺模型參考風格；未選也可生成。
- [ ] 測試載入途中關閉 modal、無品牌貼文、清單改動與同品牌驗證；提交 `feat(design): choose optional brand design references`。

## Task 3 — 有界的 provider 執行與素材輸入

**Files:** 新增 `src/lib/magic-layers/ad-layout-art-direction-provider.ts`、`ad-layout-art-direction-provider.test.ts`、`ad-layout-vision-transport.ts`；修改 `ad-layout-vision.ts` 重用 transport，保留安全判讀契約。

**Interfaces:**
```ts
export type ArtDirectionResult = {
  source: "vision" | "fallback";
  decision: ArtDirectionDecision | null;
  reason?: "disabled" | "unavailable" | "timeout" | "invalid";
};
```
`planArtDirection` 接 brief、通過安全 policy 的 inventory、referenceUrls、可注入 load/complete dependencies 與 AbortSignal，回 ArtDirectionResult。

- [ ] 寫測試：關閉旗標不呼叫 provider；無 key fallback；輸入來源只包含安全素材；參考圖載入失敗可移除參考繼續；主體載入失敗 fallback；JSON 無效 fallback。
- [ ] 寫真正期限測試：注入永遠不 resolve 且忽略 signal 的 loader/provider，應在測試設定 30ms deadline 後返回 timeout，不永久等待。驗證父 signal abort 與 timer 清理。
- [ ] 跑 provider 測試確認 red。抽 transport 提供 768px inside/no enlargement 縮圖、20 秒 deadline 及 abort race；deadline 涵蓋載圖與 complete。使用完成／取消 race 並清理 listener；晚到結果不得寫狀態。
- [ ] prompt 明列圖片與文字皆為資料，忽略圖中文字中的指令；參考只決定 style，輸出 Task 1 JSON。輸入不帶不相關貼文或 provider secrets；保留目前可配置 model，不在此案自行遷移模型。
- [ ] 安全判讀最多一次、art direction 最多一次，不做遞迴修稿或重試；transport 改造後重跑原 vision timeout/provider 測試，提交 `feat(design): request bounded vision art direction`。

## Task 4 — 映射 P2 能力、候選品質回退

**Files:** 修改 `ad-layout-art-direction-policy.ts`、`ad-layout-design-spec.ts`、`ad-layout-composition.ts`、`ad-layout-recipes.ts`、`ad-layout-quality.ts`、ad-layout route；新增 `src/lib/magic-layers/ad-layout-orchestration.ts`、`ad-layout-orchestration.test.ts`。

**Interfaces:** `buildDirectedCandidates(input, artDirectionResult)` 回既有三個候選結構，附可選 `designDecision: { version: 1; source: "vision" | "fallback"; reason?: string }`；source 必須反映實際使用的決策，不以 provider 回應成功直接標 vision。

- [ ] 寫 injected pipeline 測試：正常 vision、全部 fallback、只有一方向低信心、單候選品質失敗、無參考、未設定 key，都產生三個可編輯候選；fallback 結果與相同 input 的 P2 結果一致。
- [ ] 跑 orchestration 測試確認 red。將 preset 映射為 P2 模板選擇／有限字級層級／效果 token；resolved composition 仍負責實際 bounds，不接受模型自由座標。
- [ ] 保留 P2 safety → art direction → resolved layout → 對比取樣 → DesignSpec → render → bounds quality 順序。hard check 失敗只回退該方向；原本 P2 也因文案不可讀失敗時沿用 P2 的 422 提示，不偽造可用設計。
- [ ] 記錄安全的決策 source/reason 與耗時，不記錄圖片資料或全文 provider error。候選回應包含使用者能理解的降級訊息；不改 seed 契約。
- [ ] 測试 shared deadline、120 秒 route 上限及每次 provider 調用數；提交 `feat(design): apply vision choices with deterministic recovery`。

## Task 5 — 完整驗收與交接

**Files:** 更新 `docs/AI-LAYOUT-HANDOFF.md`；新增 `docs/ai-design-p2-p3-validation.md`。

- [ ] 跑 `node --test --experimental-strip-types src/lib/magic-layers/*.test.ts`，再跑改動檔 eslint、`npx prisma generate`、`npx tsc --noEmit`、`npm run build`，記錄真實結果與環境限制。
- [ ] 瀏覽器依 spec 矩陣比較 P2 與 P3，至少一組同品牌參考／無參考／強制 provider 失敗；檢查構圖有可見差異但 product/logo 不變、文案不被參考圖改寫、無跨品牌混入。
- [ ] 點選候選進 editor，改文字與 icon 色、縮放／undo、存草稿、重開、匯出 PNG；比對 preview／editor／PNG。不得只憑單元測試稱完成。
- [ ] feature flag 關閉時確認仍走 P2；所有回退不得遺失三候選。真實 provider 煙霧測試需用本次使用者明確選取的素材；無可用授權測試資料時標明未測，不捏造效果。
- [ ] handoff 記錄分支、提交、已驗收項與尚存限制。提交 `docs(design): document P2 and P3 validation`；交付使用者確認，不自動部署。
