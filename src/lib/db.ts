import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // Turso／遠端 libSQL：url 已經係 libsql:// 或 http(s):// 開頭，唔好夾硬變返本機 file:
  const isRemote = /^(libsql|https?|wss?):/.test(url);
  const config = isRemote
    ? { url, authToken: process.env.DATABASE_AUTH_TOKEN }
    : { url: url.startsWith("file:") ? url : `file:${url}` };
  const adapter = new PrismaLibSql(config);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
