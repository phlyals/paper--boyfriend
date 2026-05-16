import "server-only";
import type { Message } from "@/lib/db/store";
import type { MemoryHit, MemoryService } from "@/lib/memory/service";

/**
 * P1 占位实现：仅当 process.env.MEM0_API_KEY 存在时由工厂选用。
 * 期中阶段不接入，所有方法静默退化（search → 空数组，extract → 0），并打一条 warn。
 * 接入时把 search / extract 改为调用 mem0ai SDK 即可，不需要动 API Route。
 */
export class Mem0MemoryService implements MemoryService {
  async search(_userId: string, _query: string, _limit?: number): Promise<MemoryHit[]> {
    console.warn("[memory] Mem0MemoryService.search not implemented yet, returning []");
    return [];
  }

  async extract(_userId: string, _messages: Message[], _conversationId?: string): Promise<number> {
    console.warn("[memory] Mem0MemoryService.extract not implemented yet, returning 0");
    return 0;
  }
}
