import "server-only";
import crypto from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  characterPreset,
  conversation,
  imageAsset,
  memory,
  message,
  userCharacter,
  type User,
} from "@/lib/db/schema";
import { getPersona, type PersonaPreset, type PersonaSlug } from "@/lib/ai/personas";

export type { User };

export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  rawContent?: string | null;
  imageMarkers: string[];
  imageUrls: string[];
  audioUrl?: string | null;
  createdAt: string;
};

export type ConversationBundle = {
  conversation: typeof conversation.$inferSelect;
  userCharacter: typeof userCharacter.$inferSelect;
  persona: PersonaPreset;
  messages: Message[];
};

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayStartDate() {
  const now = new Date();
  const shanghai = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  shanghai.setHours(0, 0, 0, 0);
  return shanghai;
}

export function serializeMessage(row: typeof message.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    rawContent: row.rawContent,
    imageMarkers: row.imageMarkers ?? [],
    imageUrls: row.imageUrls ?? [],
    audioUrl: row.audioUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureCharacterPreset(slug: PersonaSlug) {
  const persona = getPersona(slug);
  const existing = await db.query.characterPreset.findFirst({
    where: eq(characterPreset.slug, slug),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(characterPreset)
    .values({
      slug: persona.slug,
      displayName: persona.displayName,
      shortName: persona.shortName,
      personaCore: persona.personaCore,
      defaultBaseImageUrl: persona.defaultBaseImageUrl,
      voice: persona.voice,
      imageStylePrompt: persona.imageStylePrompt,
      quotaLine: persona.quotaLine,
    })
    .onConflictDoUpdate({
      target: characterPreset.slug,
      set: {
        displayName: persona.displayName,
        shortName: persona.shortName,
        personaCore: persona.personaCore,
        defaultBaseImageUrl: persona.defaultBaseImageUrl,
        voice: persona.voice,
        imageStylePrompt: persona.imageStylePrompt,
        quotaLine: persona.quotaLine,
        updatedAt: new Date(),
      },
    })
    .returning();

  return created;
}

export function presetRowToPersona(row: typeof characterPreset.$inferSelect): PersonaPreset {
  const fallback = getPersona(row.slug);
  return {
    ...fallback,
    slug: row.slug as PersonaSlug,
    displayName: row.displayName,
    shortName: row.shortName,
    voice: row.voice as PersonaPreset["voice"],
    defaultBaseImageUrl: row.defaultBaseImageUrl,
    personaCore: row.personaCore,
    imageStylePrompt: row.imageStylePrompt,
    quotaLine: row.quotaLine,
  };
}

export async function getConversationBundle(
  conversationId: string,
  userId: string,
): Promise<ConversationBundle | null> {
  const foundConversation = await db.query.conversation.findFirst({
    where: and(eq(conversation.id, conversationId), eq(conversation.userId, userId)),
  });
  if (!foundConversation) return null;

  // messages 只依赖 conversation.id；userCharacter 只依赖 conversation.userCharacterId。并行省 1 个 RTT。
  const [foundUserCharacter, rows] = await Promise.all([
    db.query.userCharacter.findFirst({
      where: eq(userCharacter.id, foundConversation.userCharacterId),
    }),
    db.query.message.findMany({
      where: eq(message.conversationId, foundConversation.id),
      orderBy: message.createdAt,
    }),
  ]);
  if (!foundUserCharacter) return null;

  const foundPreset = await db.query.characterPreset.findFirst({
    where: eq(characterPreset.id, foundUserCharacter.presetId),
  });
  if (!foundPreset) return null;

  return {
    conversation: foundConversation,
    userCharacter: foundUserCharacter,
    persona: presetRowToPersona(foundPreset),
    messages: rows.map(serializeMessage),
  };
}

export async function getLatestConversation(userId: string) {
  return db.query.conversation.findFirst({
    where: eq(conversation.userId, userId),
    orderBy: desc(conversation.lastMessageAt),
  });
}

export async function countTodayImages(userId: string) {
  const rows = await db.query.imageAsset.findMany({
    where: and(eq(imageAsset.userId, userId), gte(imageAsset.createdAt, todayStartDate())),
    columns: { id: true },
  });
  return rows.length;
}

export async function updateConversationMemoryExtractedAt(conversationId: string) {
  await db
    .update(conversation)
    .set({ lastMemoryExtractedAt: new Date() })
    .where(eq(conversation.id, conversationId));
}

export async function listMemories(userId: string) {
  return db.query.memory.findMany({
    where: eq(memory.userId, userId),
    orderBy: desc(memory.updatedAt),
  });
}
