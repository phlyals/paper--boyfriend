import { requireApiUser } from "@/lib/auth/session";
import { getConversationBundle } from "@/lib/db/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const { id } = await params;
  const bundle = await getConversationBundle(id, user.id);
  if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({
    persona: {
      slug: bundle.persona.slug,
      displayName: bundle.persona.displayName,
      shortName: bundle.persona.shortName,
      color: bundle.persona.color,
      baseImageUrl: bundle.userCharacter.baseImageUrl,
    },
    messages: bundle.messages,
  });
}
