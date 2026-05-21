import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  // 业务扩展字段：最后登录时间 / 召回邮件发送时间
  lastLoginAt: timestamp("last_login_at", { mode: "date" }).notNull().defaultNow(),
  recallSentAt: timestamp("recall_sent_at", { mode: "date" }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const characterPreset = pgTable("character_preset", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  shortName: text("short_name").notNull(),
  personaCore: text("persona_core").notNull(),
  defaultBaseImageUrl: text("default_base_image_url").notNull(),
  voice: text("voice").notNull(),
  imageStylePrompt: text("image_style_prompt").notNull(),
  quotaLine: text("quota_line").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const userCharacter = pgTable(
  "user_character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    presetId: uuid("preset_id")
      .notNull()
      .references(() => characterPreset.id, { onDelete: "cascade" }),
    baseImageUrl: text("base_image_url").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique("user_character_user_preset_unique").on(table.userId, table.presetId)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userCharacterId: uuid("user_character_id")
      .notNull()
      .references(() => userCharacter.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { mode: "date" }).notNull().defaultNow(),
    lastMemoryExtractedAt: timestamp("last_memory_extracted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("conversation_user_id_idx").on(table.userId)],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    rawContent: text("raw_content"),
    imageMarkers: jsonb("image_markers").$type<string[]>().notNull().default([]),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    audioUrl: text("audio_url"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("message_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const imageAsset = pgTable(
  "image_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => message.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    prompt: text("prompt").notNull(),
    sourceImageUrl: text("source_image_url").notNull(),
    resultUrl: text("result_url").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("image_asset_user_created_idx").on(table.userId, table.createdAt)],
);

export const memory = pgTable(
  "memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    category: text("category").notNull().default("fact"),
    importance: integer("importance").notNull().default(3),
    sourceConversationId: uuid("source_conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("memory_user_id_idx").on(table.userId)],
);

export const moderationStrike = pgTable(
  "moderation_strike",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("moderation_strike_user_expires_idx").on(table.userId, table.expiresAt)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  userCharacters: many(userCharacter),
  conversations: many(conversation),
  memories: many(memory),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  user: one(user, { fields: [conversation.userId], references: [user.id] }),
  userCharacter: one(userCharacter, {
    fields: [conversation.userCharacterId],
    references: [userCharacter.id],
  }),
  messages: many(message),
}));

export type User = typeof user.$inferSelect;
export type Message = typeof message.$inferSelect;
