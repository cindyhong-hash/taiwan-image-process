import { Prisma } from "@prisma/client";
import { db } from "../db.ts";

export type DatabaseTimedSqlExecutor = (
  buildQuery: (databaseNowMs: Prisma.Sql) => Prisma.Sql,
) => Promise<number>;

const sqliteDatabaseNowMs = Prisma.sql`(
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
  + CAST(substr(strftime('%f', 'now'), 4, 3) AS INTEGER)
)`;

export function createSqliteDatabaseTimedExecutor(
  executeSql: (query: Prisma.Sql) => Promise<number>,
): DatabaseTimedSqlExecutor {
  return (buildQuery) => executeSql(buildQuery(sqliteDatabaseNowMs));
}

export const executeWithSqliteDatabaseTime = createSqliteDatabaseTimedExecutor(
  (query) => db.$executeRaw(query),
);

export type ProductVisualProfileLeaseWrite = {
  productId: string;
  leaseId: string;
  deadlineAt: number;
  visualProfileJson: string;
  visualProfileSourceHash: string;
  visualProfileUpdatedAt: Date;
};

/** The clock fragment is supplied only when the database executes this parameterized UPDATE. */
export async function persistProductVisualProfileWithLease(
  input: ProductVisualProfileLeaseWrite,
  execute: DatabaseTimedSqlExecutor = executeWithSqliteDatabaseTime,
): Promise<boolean> {
  const affected = await execute((databaseNowMs) => Prisma.sql`
    UPDATE "Product"
    SET
      "visualProfileJson" = ${input.visualProfileJson},
      "visualProfileSourceHash" = ${input.visualProfileSourceHash},
      "visualProfileUpdatedAt" = ${input.visualProfileUpdatedAt}
    WHERE "id" = ${input.productId}
      AND "paidOperationKind" = ${"analysis"}
      AND "paidOperationLeaseId" = ${input.leaseId}
      AND "paidOperationLeaseExpiresAt" = ${new Date(input.deadlineAt)}
      AND ${input.deadlineAt} > ${databaseNowMs}
  `);
  return affected === 1;
}

export type GeneratedImageSetRowCompletion = {
  rowId: string;
  leaseId: string;
  deadlineAt: number;
  imageUrl: string;
  prompt: string;
  paramsJson: string;
};

/** A cleanup tombstone is an adoption barrier for its exact blob URL. */
export async function completeGeneratedImageSetRowWithLease(
  input: GeneratedImageSetRowCompletion,
  execute: DatabaseTimedSqlExecutor = executeWithSqliteDatabaseTime,
): Promise<boolean> {
  const affected = await execute((databaseNowMs) => Prisma.sql`
    UPDATE "LibraryImage"
    SET
      "status" = ${"DONE"},
      "imageUrl" = ${input.imageUrl},
      "prompt" = ${input.prompt},
      "paramsJson" = ${input.paramsJson},
      "errorMessage" = ${null},
      "generationLeaseId" = ${null},
      "generationLeaseExpiresAt" = ${null}
    WHERE "id" = ${input.rowId}
      AND "status" = ${"GENERATING"}
      AND "generationLeaseId" = ${input.leaseId}
      AND "generationLeaseExpiresAt" = ${new Date(input.deadlineAt)}
      AND ${input.deadlineAt} > ${databaseNowMs}
      AND NOT EXISTS (
        SELECT 1 FROM "ImageAssetCleanupJob"
        WHERE "assetUrl" = ${input.imageUrl}
      )
  `);
  return affected === 1;
}

export type ImageAssetCleanupLeaseClaim = {
  jobId: string;
  leaseId: string;
  deadlineAt: number;
};

/** Claims a cleanup tombstone once; an expired lease is evaluated by database time. */
export async function claimImageAssetCleanupJobLease(
  input: ImageAssetCleanupLeaseClaim,
  execute: DatabaseTimedSqlExecutor = executeWithSqliteDatabaseTime,
): Promise<boolean> {
  const affected = await execute((databaseNowMs) => Prisma.sql`
    UPDATE "ImageAssetCleanupJob"
    SET
      "cleanupLeaseId" = ${input.leaseId},
      "cleanupLeaseExpiresAt" = ${new Date(input.deadlineAt)}
    WHERE "id" = ${input.jobId}
      AND (
        "cleanupLeaseId" IS NULL
        OR "cleanupLeaseExpiresAt" IS NULL
        OR (
          CAST(strftime('%s', "cleanupLeaseExpiresAt") AS INTEGER) * 1000
          + CAST(substr(strftime('%f', "cleanupLeaseExpiresAt"), 4, 3) AS INTEGER)
        ) <= ${databaseNowMs}
      )
  `);
  return affected === 1;
}
