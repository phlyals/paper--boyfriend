import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getConversationBundle, updateConversationMemoryExtractedAt } from "@/lib/db/store";
import { getMemoryService } from "@/lib/memory/service";
import { ChatClient } from "@/components/chat-client";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export default async function ChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const user = await requireUser();
  const { conversationId } = await params;
  const bundle = await getConversationBundle(conversationId, user.id);
  if (!bundle) redirect("/pick");

  // 兜底：如果上次抽取已超过 12h（或从未抽过）且本会话有消息，
  // 在响应发送之后悄悄跑一次 extract，不阻塞页面渲染。
  const lastExtract = bundle.conversation.lastMemoryExtractedAt;
  const sinceMs = lastExtract ? lastExtract.getTime() : 0;
  const stale = Date.now() - sinceMs > TWELVE_HOURS_MS;
  const newMessages = bundle.messages.filter(
    (m) => new Date(m.createdAt).getTime() > sinceMs,
  );

  if (stale && newMessages.length > 0) {
    after(async () => {
      try {
        await getMemoryService().extract(user.id, newMessages, conversationId);
        await updateConversationMemoryExtractedAt(conversationId);
      } catch (err) {
        console.error("[memory] background extract failed", err);
      }
    });
  }

  return (
    <ChatClient
      conversationId={conversationId}
      initialMessages={bundle.messages}
      persona={{
        slug: bundle.persona.slug,
        displayName: bundle.persona.displayName,
        shortName: bundle.persona.shortName,
        color: bundle.persona.color,
        baseImageUrl: bundle.userCharacter.baseImageUrl,
        quotaLine: bundle.persona.quotaLine,
      }}
    />
  );
}
