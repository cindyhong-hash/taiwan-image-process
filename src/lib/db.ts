import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const libsqlUrl = url.startsWith("file:") ? url : `file:${url}`;
  const adapter = new PrismaLibSql({ url: libsqlUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
