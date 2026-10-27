import { PrismaClient, Prisma } from "@prisma/client";
import { customerPrivacyQuery } from "./customerPrivacy";

function createClient() {
  const base = new PrismaClient({ log: [] });
  return base.$extends({
    name: "customer-data-privacy",
    query: { $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await customerPrivacyQuery(model, operation, args, query as (args: Record<string, unknown>) => Promise<unknown>);
        } catch (error) {
          const failure = error as { name?: string; code?: string; clientVersion?: string };
          // Prisma diagnostics can include query arguments. Retain retry codes,
          // while preventing customer values from reaching application logs.
          if (failure.name === "PrismaClientKnownRequestError" && failure.code) {
            throw new Prisma.PrismaClientKnownRequestError("Database operation failed.", { code: failure.code, clientVersion: failure.clientVersion ?? Prisma.prismaVersion.client });
          }
          if (failure.name?.startsWith("PrismaClient")) throw new Error("Database operation failed.");
          throw error;
        }
      },
    } },
  }) as unknown as PrismaClient;
}
const globalForPrisma = globalThis as unknown as { prismaPrivateV1: PrismaClient | undefined };
export const prisma = globalForPrisma.prismaPrivateV1 ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaPrivateV1 = prisma;

// Handles pre-migration rows and concurrent registrations without storing an email
// or endpoint in plaintext. These upserts are outside booking transactions.
/* eslint-disable @typescript-eslint/no-explicit-any -- Closed list of equivalent generated model delegates. */
export async function privateUpsert(model: "blockedCustomer" | "reviewCustomer" | "emailOptOut" | "winbackLog" | "customerPush" | "pushSubscription", args: { where: Record<string, string>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<void> {
  const delegate = prisma[model] as any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await delegate.findFirst({ where: args.where, select: { id: true } });
    try {
      if (row) await delegate.update({ where: { id: row.id }, data: args.update });
      else await delegate.create({ data: args.create });
      return;
    } catch (error) {
      if (!["P2002", "P2025"].includes((error as {code?: string}).code ?? "") || attempt === 2) throw error;
    }
  }
}
