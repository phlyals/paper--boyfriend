import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { moderationStrike } from "@/lib/db/schema";
import type { ModerationReason } from "@/lib/ai/moderation";

const STRIKE_TTL_MS = 24 * 60 * 60 * 1000; // 单条 strike 24h 内算 active
const STRIKE_THRESHOLD = 3; // 24h 内累计达到这个数 → 触发冷却
const COOLDOWN_MS = 10 * 60 * 1000; // 冷却时长：10 分钟

export type BlockStatus =
  | { blocked: false }
  | { blocked: true; until: Date; activeCount: number };

/**
 * 写一条 strike；expires_at = now + 24h。
 * 不返回 BlockStatus，调用方紧接着用 checkBlockStatus 取最新状态。
 */
export async function recordStrike(userId: string, reason: ModerationReason): Promise<void> {
  const now = new Date();
  await db.insert(moderationStrike).values({
    userId,
    reason,
    expiresAt: new Date(now.getTime() + STRIKE_TTL_MS),
  });
}

/**
 * 判断用户当前是否处于冷却禁言状态。
 * 规则：当前仍 active 的 strike 数 ≥ 3，并且最近一条 strike 在 10 分钟内 → blocked，until = lastStrike.createdAt + 10min。
 * 否则不 blocked（即便 active 计数仍 ≥ 3，超出 10 分钟冷却就放行）。
 */
export async function checkBlockStatus(userId: string): Promise<BlockStatus> {
  const now = new Date();
  const rows = await db.query.moderationStrike.findMany({
    where: and(eq(moderationStrike.userId, userId), gt(moderationStrike.expiresAt, now)),
  });
  if (rows.length < STRIKE_THRESHOLD) return { blocked: false };

  const lastStrikeAt = rows.reduce(
    (latest, r) => (r.createdAt > latest ? r.createdAt : latest),
    new Date(0),
  );
  const cooldownUntil = new Date(lastStrikeAt.getTime() + COOLDOWN_MS);
  if (cooldownUntil <= now) return { blocked: false };

  return { blocked: true, until: cooldownUntil, activeCount: rows.length };
}
