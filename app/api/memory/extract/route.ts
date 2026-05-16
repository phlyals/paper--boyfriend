import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { getMemoryService } from "@/lib/memory/service";
import { getConversationBundle, updateConversationMemoryExtractedAt } from "@/lib/db/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) return Response.json({ error: "bad_request" }, { status: 400 });

  const bundle = await getConversationBundle(conversationId, user.id);
  if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });

  const since = bundle.conversation.lastMemoryExtractedAt;
  const sinceMs = since ? since.getTime() : 0;
  const newMessages = bundle.messages.filter(
    (m) => new Date(m.createdAt).getTime() > sinceMs,
  );

  // 静默降级：抽取失败不抛错、不影响调用方继续聊天。
  let added = 0;
  try {
    added = await getMemoryService().extract(user.id, newMessages, conversationId);
  } catch (err) {
    console.error("[memory.extract] route failed", err);
  }

  // 即便 added=0 也更新时间戳，避免每次进入都跑 LLM。
  await updateConversationMemoryExtractedAt(conversationId);

  return Response.json({ ok: true, added });
}
