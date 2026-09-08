import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  claimImageAssetCleanupJobLease,
  completeGeneratedImageSetRowWithLease,
  createSqliteDatabaseTimedExecutor,
  persistProductVisualProfileWithLease,
  type DatabaseTimedSqlExecutor,
} from "./image-set-db-operations.ts";

const profileWrite = {
  productId: "product-1",
  leaseId: "analysis-old",
  deadlineAt: 20_000,
  visualProfileJson: '{"productType":"stale-old-profile"}',
  visualProfileSourceHash: "source-old",
  visualProfileUpdatedAt: new Date(10_000),
};

test("analysis SQL blocked across its deadline cannot overwrite the newer profile", async () => {
  let databaseNowMs = 19_999;
  let storedProfile = "newer-worker-profile";
  let entered!: () => void;
  const didEnter = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const execute: DatabaseTimedSqlExecutor = async () => {
    entered();
    await gate;
    if (databaseNowMs >= profileWrite.deadlineAt) return 0;
    storedProfile = profileWrite.visualProfileJson;
    return 1;
  };

  const pending = persistProductVisualProfileWithLease(profileWrite, execute);
  await didEnter;
  databaseNowMs = profileWrite.deadlineAt;
  release();

  assert.equal(await pending, false);
  assert.equal(storedProfile, "newer-worker-profile");
});

test("SQLite/libSQL lease SQL accepts one millisecond before deadline and rejects the exact boundary", async () => {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url: "file::memory:" }) });
  try {
    await client.$executeRaw(Prisma.sql`
      CREATE TABLE "Product" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "visualProfileJson" TEXT NOT NULL,
        "visualProfileSourceHash" TEXT,
        "visualProfileUpdatedAt" DATETIME,
        "paidOperationLeaseId" TEXT,
        "paidOperationLeaseExpiresAt" DATETIME,
        "paidOperationKind" TEXT
      )
    `);
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "Product" (
        "id", "visualProfileJson", "paidOperationLeaseId", "paidOperationLeaseExpiresAt", "paidOperationKind"
      ) VALUES (
        ${profileWrite.productId}, ${"newer-worker-profile"}, ${profileWrite.leaseId},
        ${new Date(profileWrite.deadlineAt)}, ${"analysis"}
      )
    `);

    const at = (databaseNowMs: number): DatabaseTimedSqlExecutor => (
      (buildQuery) => client.$executeRaw(buildQuery(Prisma.sql`${databaseNowMs}`))
    );
    assert.equal(await persistProductVisualProfileWithLease(profileWrite, at(19_999)), true);
    await client.$executeRaw(Prisma.sql`
      UPDATE "Product" SET "visualProfileJson" = ${"newer-worker-profile"}
      WHERE "id" = ${profileWrite.productId}
    `);
    assert.equal(await persistProductVisualProfileWithLease(profileWrite, at(20_000)), false);
    const rows = await client.$queryRaw<Array<{ visualProfileJson: string }>>(Prisma.sql`
      SELECT "visualProfileJson" FROM "Product" WHERE "id" = ${profileWrite.productId}
    `);
    assert.equal(rows[0].visualProfileJson, "newer-worker-profile");
  } finally {
    await client.$disconnect();
  }
});

test("SQLite/libSQL production clock executor emits integer epoch milliseconds", async () => {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url: "file::memory:" }) });
  try {
    const observed = await createSqliteDatabaseTimedExecutor(async (query) => {
      const rows = await client.$queryRaw<Array<{ nowMs: bigint | number }>>(Prisma.sql`
        SELECT ${query} AS "nowMs"
      `);
      return Number(rows[0].nowMs);
    })(databaseNowMs => databaseNowMs);
    assert.equal(Number.isInteger(observed), true);
    assert.equal(observed > 1_700_000_000_000, true);
  } finally {
    await client.$disconnect();
  }
});

test("a cleanup tombstone atomically blocks DONE adoption until cleanup resolves", async () => {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url: "file::memory:" }) });
  try {
    await client.$executeRaw(Prisma.sql`
      CREATE TABLE "LibraryImage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL,
        "imageUrl" TEXT NOT NULL,
        "prompt" TEXT NOT NULL,
        "paramsJson" TEXT NOT NULL,
        "errorMessage" TEXT,
        "generationLeaseId" TEXT,
        "generationLeaseExpiresAt" DATETIME
      )
    `);
    await client.$executeRaw(Prisma.sql`
      CREATE TABLE "ImageAssetCleanupJob" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "assetUrl" TEXT NOT NULL UNIQUE
      )
    `);
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "LibraryImage" (
        "id", "status", "imageUrl", "prompt", "paramsJson", "generationLeaseId", "generationLeaseExpiresAt"
      ) VALUES (
        ${"row-1"}, ${"GENERATING"}, ${""}, ${""}, ${"{}"}, ${"generation-1"}, ${new Date(20_000)}
      )
    `);
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "ImageAssetCleanupJob" ("id", "assetUrl") VALUES (${"cleanup-1"}, ${"https://blob.example/race.png"})
    `);
    const execute = (buildQuery: Parameters<DatabaseTimedSqlExecutor>[0]) => (
      client.$executeRaw(buildQuery(Prisma.sql`${10_000}`))
    );
    const completion = {
      rowId: "row-1",
      leaseId: "generation-1",
      deadlineAt: 20_000,
      imageUrl: "https://blob.example/race.png",
      prompt: "safe prompt",
      paramsJson: "{}",
    };

    assert.equal(await completeGeneratedImageSetRowWithLease(completion, execute), false);
    await client.$executeRaw(Prisma.sql`DELETE FROM "ImageAssetCleanupJob" WHERE "id" = ${"cleanup-1"}`);
    assert.equal(await completeGeneratedImageSetRowWithLease(completion, execute), true);
    const rows = await client.$queryRaw<Array<{ status: string; imageUrl: string }>>(Prisma.sql`
      SELECT "status", "imageUrl" FROM "LibraryImage" WHERE "id" = ${"row-1"}
    `);
    assert.deepEqual(rows, [{ status: "DONE", imageUrl: "https://blob.example/race.png" }]);
  } finally {
    await client.$disconnect();
  }
});

test("only one cleaner can atomically claim the same available tombstone", async () => {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url: "file::memory:" }) });
  try {
    await client.$executeRaw(Prisma.sql`
      CREATE TABLE "ImageAssetCleanupJob" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "cleanupLeaseId" TEXT,
        "cleanupLeaseExpiresAt" DATETIME
      )
    `);
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "ImageAssetCleanupJob" ("id", "cleanupLeaseId", "cleanupLeaseExpiresAt")
      VALUES (${"cleanup-1"}, ${null}, ${null})
    `);
    const execute = (buildQuery: Parameters<DatabaseTimedSqlExecutor>[0]) => (
      client.$executeRaw(buildQuery(Prisma.sql`${10_000}`))
    );
    assert.equal(await claimImageAssetCleanupJobLease({
      jobId: "cleanup-1",
      leaseId: "cleaner-a",
      deadlineAt: 20_000,
    }, execute), true);
    assert.equal(await claimImageAssetCleanupJobLease({
      jobId: "cleanup-1",
      leaseId: "cleaner-b",
      deadlineAt: 20_000,
    }, execute), false);
  } finally {
    await client.$disconnect();
  }
});
