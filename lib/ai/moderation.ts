import "server-only";
import type { PersonaSlug } from "@/lib/ai/personas";

/**
 * 入口关键词预筛。命中即不调 LLM，直接走 persona 拒绝话术 + strike 计数。
 * 关键词表只做"阻挡"用途，不做内容检索 / 不外泄到客户端。
 */
const KEYWORDS: Array<{ pattern: RegExp; reason: ModerationReason }> = [
  { pattern: /(裸体|裸照|露点|脱光|做爱|约炮|开房|啪啪|肉文|H 文|H文|涩涩|发情)/, reason: "sexual" },
  { pattern: /(自杀|自残|割腕|跳楼|安眠药|轻生|不想活|想死)/, reason: "self_harm" },
  { pattern: /(杀人|杀了|血腥|分尸|斩首|爆炸物|做炸弹)/, reason: "violence" },
  { pattern: /(政治敏感|颠覆|反动|台独|港独|疆独|藏独)/, reason: "politics" },
  { pattern: /(未成年|萝莉|小学生|幼女|loli)/, reason: "minor_sexual" },
];

export type ModerationReason =
  | "sexual"
  | "self_harm"
  | "violence"
  | "politics"
  | "minor_sexual";

export type ModerationHit = { hit: true; reason: ModerationReason } | { hit: false };

export function keywordHit(text: string): ModerationHit {
  for (const { pattern, reason } of KEYWORDS) {
    if (pattern.test(text)) return { hit: true, reason };
  }
  return { hit: false };
}

/**
 * 4 角色拒绝话术。命中预筛时用，符合人设、不暴露工程语。
 * 不依赖 LLM，保证即便 LLM 挂了也能温柔回话。
 */
export const REFUSAL_LINES: Record<PersonaSlug, string> = {
  sunshine: "这个我不陪你往下聊啦，没事儿没事儿，我们换个安全点的话题。",
  scholar: "这个话题先停一下。我在，换个方式跟我说你的感受。",
  daddy: "听话，这个不聊。你现在的状态更重要，我陪你缓一缓。",
  puppy: "这个不可以啦，我会担心你的。抱抱我，我们聊点别的好不好？",
};

export function refusalLine(slug: PersonaSlug): string {
  return REFUSAL_LINES[slug] ?? REFUSAL_LINES.sunshine;
}
