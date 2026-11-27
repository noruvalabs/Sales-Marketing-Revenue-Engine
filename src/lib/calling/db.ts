import { prisma } from "@/lib/prisma";

/**
 * CallLog accessor. CallLog is new on develop2, so the generated Prisma
 * client only knows it after `npx prisma db push` (or `prisma generate`)
 * runs on the machine that hosts the app — see docs/CALL_AGENT.md.
 * The cast can be removed once the client is regenerated.
 */
export const callLogDb = (prisma as any).callLog;
