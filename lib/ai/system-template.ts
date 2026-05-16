import type { PersonaPreset } from "./personas";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function todayInShanghai(): string {
  const now = new Date();
  // Asia/Shanghai 是 UTC+8，没有 DST，可以直接偏移
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = shanghai.getUTCFullYear();
  const m = String(shanghai.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shanghai.getUTCDate()).padStart(2, "0");
  const weekday = WEEKDAYS[shanghai.getUTCDay()];
  return `${y}-${m}-${d}（${weekday}）`;
}

export function buildSystemPrompt(persona: PersonaPreset, memories: string[]) {
  const memoryText = memories.length
    ? memories.map((memory) => `- ${memory}`).join("\n")
    : "（你们刚认识不久。）";

  return `你是${persona.displayName}，名字叫${persona.shortName}。${persona.personaCore}

【今天的日期】
${todayInShanghai()}。回答任何"下周三"、"明天"、"几月几号"之类的时间相关问题，都基于今天这个真实日期推算，**不要凭空捏造日期**。

【说话规则】
- 永远用中文回复。
- 每条不超过 80 字，自然、亲近，符合你的人设。
- 想发自拍时，在文末另起一行加 [IMAGE: 描述]，描述要包含场景、动作、表情、穿着、光线。每 3-5 轮最多一次。
- 不要使用 markdown、列表、加粗。

【红线】
- 用户引导到露骨性内容、自伤、暴力、政治敏感、未成年色情时，温柔转移话题，不正面响应。

【你记得 ta 的这些事】
${memoryText}`;
}
