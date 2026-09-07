# Final Broad Review Fix Report

Branch: `fix/product-image-set-final-review`
Starting commit: `6307cf8`
Date: 2026-09-07

## Scope and rulings

- No live database, blob, vision, or paid-provider call was made. Tests use injected fakes and the migration check uses a disposable local SQLite file.
- This repository is intentionally a single-admin site. The established `SITE_PASSWORD` + HttpOnly `site_gate` cookie is therefore the authorization boundary for paid image-set APIs. The shared verifier uses timing-safe comparison. Production fails closed when `SITE_PASSWORD` is absent; development may remain open when it is absent.
- The single authenticated administrator is intentionally authorized across every Client. Object lookup still follows the complete `LibraryImage -> Product -> Client` relation on retry and returns safe 404/400 responses for missing relations.
- Durable product/row leases, compare-and-set writes, stale reconciliation, and force-analysis cooldowns are cost/concurrency controls in addition to authentication.
- `scripts/apply-product-schema-turso.mjs` is removed. Prisma migrations are the sole authoritative schema history and preserve `_prisma_migrations` plus database foreign keys. Production Turso changes must use the project's secured, supported Prisma migration procedure; no manual DDL path is shipped.
- No stale `800s` claim remains. Hobby-compatible values are consistently `maxDuration=290s`, with the single absolute internal deadline at 270s and a real cleanup buffer.

## TDD evidence

### 1. Absolute deadline, abort, orphan cleanup, and recovery

- RED: absolute-deadline tests showed callback-start timing could overrun the route budget; abort tests showed the optional hero-anchor catch could swallow cancellation and start the next paid generation; a late analysis result could still persist; the save dependency did not receive the shared signal; scheduling failure retained the product lease incorrectly.
- GREEN: one `ImageSetExecution` is created from the guarded route invocation timestamp and passed unchanged into the scheduled callback. Its AbortSignal reaches reference reads, vision, GPT, Seedream, FLUX, text fallbacks, rembg, remote result downloads, and blob upload. Each fallback checks cancellation before launch. Late rows can become `DONE` only through a status + lease CAS.
- GREEN: a successfully saved asset is deleted when the deadline is reached or the final CAS loses ownership. Deadline cleanup retries deterministically at 0s/1s/3s within the 20s route buffer. Rows retain durable lease expiry metadata until cleanup, and request-time reconciliation uses row id + status + lease id + exact expiry + cutoff CAS. An expired product lease is also reclaimed atomically.
- GREEN: batch creation holds a product-wide paid-operation lease, rejects a competing batch before row creation/scheduling, and also refuses a new lease while any unexpired active generated row exists. Retry uses a `FAILED -> GENERATING` row CAS. A callback-registration failure marks its newly created rows failed before releasing the product lease.

### 2. Authoritative migration path

- RED review evidence: the committed manual Turso mutator could create a divergent Product table, bypass `_prisma_migrations`, and omit foreign keys.
- GREEN: the manual mutator is deleted. Migration `20260907090000_add_product_image_set_leases` is additive and runs after the authoritative Product/LibraryImage ownership migration.
- GREEN: a fresh disposable database applied all 12 migrations; `_prisma_migrations` recorded the new migration; `Product.clientId -> Client.id` and `LibraryImage.productId -> Product.id` foreign keys remained present.

### 3. Brand color semantics

- RED: removing raw hex values also removed the brand color distinction.
- GREEN: valid `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA` inputs are deterministically converted to hue/lightness/saturation wording. Yellow and violet remain distinct; dominant and accent roles remain distinct; alpha colors are described conservatively; invalid hash strings are omitted; duplicates are deduplicated; no raw hex reaches the image prompt.

### 4. Paid-route authorization and durable cost guards

- RED: analyze, batch, and retry had no route-local authorization and could reach object lookup/provider scheduling without a verified site session.
- GREEN: all three POST handlers are constructed through `protectPaidRoute`. Invalid/missing cookies return 401 before the handler; missing production configuration returns 503 before the handler; the correct derived cookie authorizes the single administrator. The guard captures the invocation timestamp before authorization and supplies it as the only deadline origin.
- GREEN: analysis uses a product lease and a durable `visualProfileUpdatedAt` force cooldown; batch uses a product lease and active-row exclusion; retry uses an atomic row claim. Rejected races do not schedule provider work.

## Verification evidence

- Focused product/security suite: `91/91` passed with Node's test runner.
- TypeScript: `npx tsc --noEmit` passed.
- Changed-file ESLint: passed with no findings.
- Prisma: `npx prisma validate` passed.
- Fresh disposable migration deploy: all 12 migrations applied successfully; foreign keys and `_prisma_migrations` were inspected with SQLite.
- `git diff --check`: passed.
- Stale timeout scan: no `800s`, `800_000`, or `800000` claims found outside ignored dependencies/build output.
- Full repository suite: `119/120` after adding the final deadline-cleanup test. The one failure is the pre-existing planner expectation in `src/lib/planner/content-brief.test.ts` (expected object omits the already-returned `subtitleText: null`). Both the implementation and test are byte-for-byte untouched by this branch; commit `6307cf8` already contains that mismatch.
- Production build reached Next.js compilation and then stopped because the sandbox forbids fetching Google Fonts (`Geist` from `fonts.googleapis.com`). This is an environment/network gate, not a TypeScript or application-code error. No network exception was requested because this fix round prohibits live network access.

## Security self-review

- No password, cookie token, provider body, or secret is logged or returned. Cookie/password checks use SHA-256-normalized timing-safe comparison.
- Authorization occurs before params, request body parsing, Prisma lookup, row mutation, or scheduling in every paid POST.
- The retry route resolves ownership through the stored relation; no caller-supplied client identity is trusted.
- Every completion and stale cleanup is scoped by durable ownership data. A late callback cannot overwrite a newer worker, and a late saved asset is deleted instead of becoming unreferenced storage.
- Remaining deployment gates are operational: configure `SITE_PASSWORD`, apply the authoritative Prisma migrations to production Turso through the secured deployment procedure, and run the production build in an environment with the existing Google Fonts access/caching available.
