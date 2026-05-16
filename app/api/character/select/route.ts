import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/auth/session";
import { getPersona, personas, type PersonaSlug } from "@/lib/ai/personas";
import { db } from "@/lib/db/client";
import { conversation, userCharacter } from "@/lib/db/schema";
import { ensureCharacterPreset } from "@/lib/db/store";

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const presetSlug = String(body.presetSlug ?? "sunshine") as PersonaSlug;
  if (!personas[presetSlug]) {
    return Response.json({ error: "unknown_persona" }, { status: 400 });
  }

  const persona = getPersona(presetSlug);
  const preset = await ensureCharacterPreset(presetSlug);

  let foundUserCharacter = await db.query.userCharacter.findFirst({
    where: and(eq(userCharacter.userId, user.id), eq(userCharacter.presetId, preset.id)),
  });

  if (!foundUserCharacter) {
    const [created] = await db
      .insert(userCharacter)
      .values({
        userId: user.id,
        presetId: preset.id,
        baseImageUrl: persona.defaultBaseImageUrl,
      })
      .returning();
    foundUserCharacter = created;
  }

  let foundConversation = await db.query.conversation.findFirst({
    where: and(
      eq(conversation.userId, user.id),
      eq(conversation.userCharacterId, foundUserCharacter.id),
    ),
    orderBy: desc(conversation.lastMessageAt),
  });

  if (!foundConversation) {
    const [created] = await db
      .insert(conversation)
      .values({
        userId: user.id,
        userCharacterId: foundUserCharacter.id,
      })
      .returning();
    foundConversation = created;
  }

  return Response.json({ conversationId: foundConversation.id });
}
