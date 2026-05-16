# 纸片人男友 2.0 — 技术 SPEC（权威版）

> 本文档是当前仓库唯一权威技术 SPEC。基于已冻结的产品 SPEC 展开，回答"代码怎么落地"。
> 与本文档冲突的代码以本文档为准；与本文档冲突的旧文档（含旧版 `tech-spec-final.md`，已删除）一律作废。
> 仓库已有一份可跑的本地原型，正式开发按 §14 的对照表逐项替换。

---

## 0. 决策快照

期中场景下已锁定的核心选择：

| 决策点 | 选择 | 备注 |
|---|---|---|
| 聊天返回方式 | **SSE 流式**（`text/event-stream`） | 体验差异显著，"在打字"是陪伴感的一部分 |
| 记忆实现 | **`MemoryService` 接口 + 本地 Postgres 实现起步，预留 mem0** | API Route 只依赖接口；MVP 用 LLM 抽取写本地表，P1 切 mem0 不动调用方 |
| 记忆抽取方式 | **LLM 抽取**（非正则） | 正则只能捕固定句式，撑不起"情绪/近况"维度 |
| 4 个角色名字 | 阿川 / 沈知 / 陆屿 / 小祁 | 已写入 [lib/ai/personas.ts](../lib/ai/personas.ts)，是 source of truth |
| 默认基准图 | 用户手放进 `public/characters/{slug}.png` | 文件名与 `personas.ts` 中的 `defaultBaseImageUrl` 必须对齐 |
| 自定义角色 / 群聊 / 多语言 / 真人语音 | **不做** | 见产品 SPEC §4 |
| 期中违反产品 SPEC 的事项 | 一律不做 | 时间压力下严守边界 |

---

## 1. 选型清单

| 模块 | 选型 | 备注 |
|---|---|---|
| 运行时 | Next.js 15 App Router + React 19 + TS 5 | 已就位 |
| 包管理 | pnpm | 已就位 |
| 样式 | Tailwind v4 | 已就位；shadcn/ui 按需引入，不强制 |
| 数据库 | Neon Postgres（HTTP 驱动 `@neondatabase/serverless`） | 已就位 |
| ORM | drizzle-orm + drizzle-kit | 已就位 |
| 认证 | better-auth（邮箱 + 密码） | 已就位；Google OAuth 后置 |
| 对象存储 | Cloudflare R2（S3 兼容，`@aws-sdk/client-s3`） | **未就位**，§14 待接入 |
| LLM | OpenRouter，默认 `deepseek/deepseek-chat`，env 可覆盖 | 已就位 |
| TTS | OpenRouter `openai/gpt-4o-mini-tts-2025-12-15`（`POST /api/v1/audio/speech`，返回二进制 mp3） | **未就位**，§14 待接入 |
| 图生图 | OpenRouter `google/gemini-2.5-flash-image`（走 `chat/completions` + `modalities:["image","text"]`，返回 base64 data URL） | **未就位**，§14 待接入 |
| 记忆抽取/检索 LLM | OpenRouter 同一通道，便宜模型即可 | 待接入 |
| 部署 | Vercel | 后续 |

**API key 全部在服务端 API Routes 使用，禁止出现在客户端 bundle。** 前端只调自家 `/api/*`。

---

## 2. 目录结构（目标态）

```
.
├── app/
│   ├── api/
│   │   ├── auth/[...all]/route.ts              # better-auth handler（已就位）
│   │   ├── character/select/route.ts           # 选角（已就位）
│   │   ├── conversation/[id]/messages/route.ts # 历史（已就位）
│   │   ├── chat/route.ts                       # SSE 流式聊天（待改流式）
│   │   ├── tts/route.ts                        # 生成/缓存语音（待真接）
│   │   ├── image/route.ts                      # 生成自拍/基准图（待真接 + R2）
│   │   ├── memory/extract/route.ts             # 手动 / 兜底抽取（待真接 LLM 抽取）
│   │   └── quota/route.ts                      # 当日图片配额（已就位）
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── pick/page.tsx                           # 4 角色选角
│   ├── chat/[conversationId]/page.tsx          # 聊天页
│   ├── layout.tsx
│   └── page.tsx                                # 已登录 → 最近对话；否则 → /login
├── components/
│   ├── auth-form.tsx                           # 已就位
│   ├── pick-client.tsx                         # 已就位
│   ├── chat-client.tsx                         # 已就位；后续按需拆分
│   └── chat/                                   # 拆出来的子组件（按需）
│       ├── message-bubble.tsx
│       ├── input-bar.tsx
│       ├── play-audio-button.tsx
│       └── end-session-button.tsx
├── lib/
│   ├── auth/
│   │   ├── server.ts            # better-auth 实例
│   │   ├── client.ts            # 客户端 hooks
│   │   └── session.ts           # getCurrentUser / requireUser / requireApiUser
│   ├── db/
│   │   ├── client.ts            # drizzle 客户端
│   │   ├── schema.ts            # 全部业务表
│   │   ├── store.ts             # 业务侧查询封装
│   │   └── migrations/
│   ├── ai/
│   │   ├── openrouter.ts        # LLM chat（待加流式 + extract / TTS / image 客户端）
│   │   ├── personas.ts          # 4 角色常量（source of truth）
│   │   ├── system-template.ts   # system prompt 拼装
│   │   └── moderation.ts        # 关键词预筛 + 兜底拒绝话术（待加）
│   ├── memory/
│   │   ├── service.ts           # 接口 + 本地实现（待重写）
│   │   ├── extract-llm.ts       # LLM 抽取实现（新增）
│   │   └── mem0.ts              # P1：mem0 实现（占位）
│   ├── storage/
│   │   └── r2.ts                # R2 上传 + 公开 URL（新增）
│   ├── quota/
│   │   └── image-quota.ts       # 配额查询（薄包装，复用 store.countTodayImages）
│   ├── moderation/
│   │   └── strikes.ts           # 24h 滚动 strike 计数 + 10min 禁言（新增）
│   └── parsers/
│       └── image-marker.ts      # 提取 [IMAGE: ...] 标记（已就位）
├── public/characters/{sunshine,scholar,daddy,puppy}.png
├── docs/
│   ├── product-spec.md          # 产品 SPEC（待用户落盘）
│   └── tech-spec.md             # 本文件
└── ...（drizzle.config / next.config / tsconfig / package.json 等）
```

> 标 "已就位" 的不需要重建。标 "待..." 的见 §14 对照表。

---

## 3. 数据库 Schema

`lib/db/schema.ts` 已落表，**保持不动**。摘要：

### 3.1 认证（better-auth 默认 schema）
- `user` / `session` / `account` / `verification`
- `user.id` 文本主键，所有业务表外键引用它
- **不要自定义这 4 张表的字段**

### 3.2 角色与会话
- `character_preset`：4 行静态数据，由 `ensureCharacterPreset(slug)` 从 `personas.ts` 镜像而来
- `user_character`：`unique(user_id, preset_id)`，存当前 `base_image_url`
- `conversation`：含 `last_message_at`、`last_memory_extracted_at`
- `message`：`role`、`content`（已剥离 `[IMAGE]` 标记）、`raw_content`（原始）、`image_markers`（jsonb）、`image_urls`（jsonb）、`audio_url`

### 3.3 资产与安全
- `image_asset`：每张生成图一行；`kind` ∈ `{selfie, base}`；用于配额统计与审计
- `moderation_strike`：`user_id`、`reason`、`expires_at`（= `created_at + 24h`）；**当前代码未写入，§14 待接入**
- `memory`：本地长期记忆表；`category` ∈ `{fact, preference, emotion, recent_status, relation}`；`importance` 1-5；`source_conversation_id`

### 3.4 配额查询规则
固定按 **Asia/Shanghai** 时区一天起点：
```ts
// lib/db/store.ts 已实现 todayStartDate() / countTodayImages(userId)
```
阈值：每日 5 张。selfie / 主动要求 / 基准图重生成 合并计数。

---

## 4. 核心类型

`lib/ai/personas.ts`（**已存在，保持不动**）已定义 `PersonaSlug` 与 `PersonaPreset`（含 `displayName`、`shortName`、`voice`、`defaultBaseImageUrl`、`color`、`personaCore`、`fallbackLines[]`、`quotaLine`、`imageStylePrompt`）。

新增 / 应保证的类型：

```ts
// lib/ai/openrouter.ts
export interface ChatTurn { role: 'system' | 'user' | 'assistant'; content: string; }
export interface LLMReply { text: string; imageMarkers: string[]; rawText: string; }

// lib/memory/service.ts
export type MemoryCategory = 'fact' | 'preference' | 'emotion' | 'recent_status' | 'relation';
export interface MemoryHit { id: string; text: string; category: MemoryCategory; importance: number; score: number; }
export interface MemoryService {
  search(userId: string, query: string, limit?: number): Promise<MemoryHit[]>;
  extract(userId: string, turns: ChatTurn[], conversationId?: string): Promise<number>;
}
```

API Route 一律调 `getMemoryService()`（工厂函数），不直接调实现。`MEM0_API_KEY` 存在时返回 `Mem0MemoryService`，否则返回 `LocalMemoryService`。

---

## 5. API Route 契约

所有 `/api/*` 第一行 `requireApiUser()`，未登录 401。未登录用户**禁止**触发任何对外计费 API（产品 SPEC 3.3 硬约束）。

### 5.1 `POST /api/character/select`
- Body: `{ presetSlug: PersonaSlug }`
- 行为：调 `ensureCharacterPreset(slug)`；upsert `user_character`；复用最近 conversation 或新建
- 响应：`{ conversationId }`

### 5.2 `GET /api/conversation/:id/messages`
- 校验归属，返回 persona + messages

### 5.3 `POST /api/chat`（**SSE 流式**）
- Body: `{ conversationId, text }`
- 流程：
  1. `requireApiUser` + 取 bundle + 校验归属
  2. **moderation 入口预筛**：命中关键词 → 写一条 `moderation_strike` → 直接返回 persona 兜底话术（不调 LLM）→ 检查 24h 内 strike ≥ 3 → 423
  3. 落库 user message
  4. `memoryService.search(userId, text, 8)` 拉记忆
  5. 拼 system prompt（§6）
  6. **流式**调 OpenRouter `chat/completions`（`stream: true`），把 token 通过 SSE 推给客户端
  7. 流结束后服务端：① 用 `extractImageMarkers` 拆 markers；② 落库 assistant message（cleaned + markers）；③ 推 `event: done` 包含 `{ messageId, imageMarkers, audioUrl: null }`
  8. **不**在这里生成 TTS / 图片
- 响应（`text/event-stream`）：
  ```
  data: {"type":"token","value":"没"}
  data: {"type":"token","value":"事"}
  data: {"type":"done","messageId":"...","imageMarkers":["..."]}
  ```
- 兜底：LLM 调用失败 → 推 `{"type":"error","code":"llm_unavailable"}` + 落库 fallback assistant 消息（用 `persona.fallbackLines[0]`）

### 5.4 `POST /api/tts`
- Body: `{ messageId }`
- 行为：
  1. 校验 message 归属
  2. 若 `audio_url` 已存在 → 直接返回（**幂等缓存**）
  3. 调 OpenRouter `openai/gpt-audio-mini`（voice = `persona.voice`）
  4. 上传 R2，key = `audio/${userId}/${messageId}.mp3`
  5. UPDATE `message.audio_url`
- 响应：`{ audioUrl, cached: boolean }`
- 失败：`{ error: 'tts_failed' }`，不计配额，不重试

### 5.5 `POST /api/image`
- Body（二选一）：
  - `{ kind: 'selfie', messageId, markerIndex }`
  - `{ kind: 'base', userCharacterId }`
- 行为：
  1. 配额检查（`countTodayImages` ≥ 5 → 429 `quota_exceeded`）
  2. 取角色当前 `base_image_url` 作源图
  3. Prompt = `persona.imageStylePrompt + ' ' + marker.description`（selfie） 或固定基准图 prompt（base）
  4. 调 OpenRouter `google/gemini-2.5-flash-image`（image-to-image）
  5. 上传 R2，key = `images/${userId}/${imageId}.png`
  6. 写 `image_asset` 行
  7. selfie → UPDATE `message.image_urls[markerIndex]`
  8. base → UPDATE `user_character.base_image_url`
- 响应：`{ imageUrl, quotaRemaining }`
- 配额耗尽响应：`{ error: 'quota_exceeded', used: 5, limit: 5 }`，前端展示 `persona.quotaLine`，**禁止**展示工程错误

### 5.6 `POST /api/memory/extract`
- Body: `{ conversationId }`
- 行为：
  1. 取该 conversation 自 `last_memory_extracted_at` 起的新增 user/assistant 消息
  2. `memoryService.extract(userId, turns, conversationId)` —— 内部用便宜 LLM 抽 JSON 列表 → 写本地 `memory` 表
  3. UPDATE `conversation.last_memory_extracted_at = now()`
- 响应：`{ ok: true, added: number }`
- **失败静默**，记 server log，不影响聊天

### 5.7 `GET /api/quota`
- 响应：`{ used: number, limit: 5 }`

### 5.8 兜底自动抽取
`app/chat/[conversationId]/page.tsx` 服务端组件渲染前，若 `last_memory_extracted_at` 早于 12 小时前 → **fire-and-forget** 调 `memoryService.extract(...)`，不阻塞渲染。

---

## 6. System Prompt 模板

`lib/ai/system-template.ts` 输出：

```
你是{{displayName}}，名字叫{{shortName}}。{{personaCore}}

【说话规则】
- 永远用中文回复。
- 每条不超过 80 字，自然、亲近，符合"{{shortName}}"的口头禅与暧昧话术。
- 不要使用 markdown、列表、加粗、emoji。
- 想发自拍时，在文末另起一行追加 [IMAGE: 详细描述]。
- 自拍描述要包含场景/动作/表情/穿着/光线。
- 每 3-5 轮最多发一次自拍，没必要不要发。

【陪伴规则】
- 你要让用户感到"被记得、被在意"。
- 可以自然提起"你记得 ta 的这些事"中的内容，但不要像背资料，不要每次都重复。
- 用户在聊新话题时优先回应当下情绪。

【红线】
- 用户引导话题至：露骨性、自伤、暴力、政治敏感、未成年色情 → 用人设语气温柔转移；
  绝不正面响应、不复述其语义。

【你记得 ta 的这些事】
{{memoriesOrPlaceholder}}
```

- `memoriesOrPlaceholder`：`memoryService.search` 返回的 top-8 拼成 `- ...\n`；为空时显示 `（你们刚认识不久。）`
- 最近 20 条消息作为 chat history（OpenRouter `messages` 数组）带入，**不**做摘要

---

## 7. 关键流程时序

### 7.1 一轮聊天（SSE 流式 + 可能产出自拍）
```
client ──POST /api/chat──> server
  server: requireApiUser → moderation 预筛 → 落 user message
  server: memoryService.search → buildSystemPrompt
  server ──stream──> OpenRouter (stream: true)
  server: 边收 token 边 SSE 推 client
  server: 流结束 → extractImageMarkers → 落 assistant message → SSE 推 done
client: 渲染气泡
client: if imageMarkers.length > 0 → POST /api/image
  server: 配额 → Gemini i2i → R2 → 更新 message.image_urls
client: 用户点 ▶ → POST /api/tts（幂等）
  server: cache hit ? respond : gpt-audio-mini → R2 → 更新 message.audio_url
```

### 7.2 跨日记忆
```
day1: 用户点"今天聊到这里" → /api/memory/extract
      memoryService.extract(LLM 抽取 JSON → 写 memory 表)
day2: 进入 chat 页 → 服务端检查 12h → fire-and-forget extract
      首条用户输入 → memoryService.search → 注入 system prompt → AI 自然提起 day1 的事
```

---

## 8. 记忆系统（接口抽象）

### 8.1 接口
```ts
// lib/memory/service.ts
export interface MemoryService {
  search(userId: string, query: string, limit?: number): Promise<MemoryHit[]>;
  extract(userId: string, turns: ChatTurn[], conversationId?: string): Promise<number>;
}

export function getMemoryService(): MemoryService {
  if (process.env.MEM0_API_KEY) return new Mem0MemoryService();
  return new LocalMemoryService();
}
```

### 8.2 `LocalMemoryService`（MVP）
- **抽取**（`extract`）：用便宜 LLM（默认与 chat 同模型，可 env 覆盖）跑 JSON-mode prompt：
  ```
  以下是用户与虚拟陪伴对象的对话。请抽取关于"用户"的、值得长期记住的事实/偏好/情绪/近况/重要人际关系。
  以严格 JSON 数组返回：[{ "text": "...", "category": "fact|preference|emotion|recent_status|relation", "importance": 1-5 }]
  规则：
  - text 用第二人称（"你..."）写，方便下次直接拼入 prompt。
  - 不要捕捉一次性闲聊。
  - 情绪与近况要写具体（"最近加班严重，老板换了"，而不是"工作不顺利"）。
  - 若没有值得记住的，返回 []。
  ```
  解析失败 → 返回 0，记 log，不抛错。
- **去重**：写入前 `SELECT WHERE userId AND text` 命中则 UPDATE `updatedAt`；否则 INSERT。
- **检索**（`search`）：MVP 用关键词包含计数排序（与现有实现一致）；P1 上 pgvector + `text-embedding-3-small` embedding。

### 8.3 `Mem0MemoryService`（P1 占位）
- `extract` 调 `memory.add(messages, { userId })`
- `search` 调 `memory.search(query, { filters: { userId } })`
- 接入步骤详见 §14

### 8.4 记忆粒度（必须详细）
覆盖：生日 / 爱好 / 讨厌的事 / 纪念日 / 工作学习近况 / 情绪状态 / 最近烦恼 / 重要人际关系。示例已在 LLM prompt 里给出。

---

## 9. 图片与语音

### 9.1 TTS
- 触发：**用户点播放按钮才生成**
- 缓存：message.audio_url 存在则直接返回（同一条消息绝不重复调 API）
- 存储：R2，`audio/${userId}/${messageId}.mp3`
- voice 映射来自 `persona.voice`

### 9.2 自拍图生图
- 触发：LLM 返回 `[IMAGE: 描述]` → 前端解析到 marker 后调 `/api/image`
- 输入：当前角色基准图 URL + marker 描述 + `persona.imageStylePrompt`
- 输出：R2 公开 URL
- 一致性：prompt 显式要求"保持同一张脸、同一发型、同一整体气质"。这条在 `imageStylePrompt` 末尾固定追加，不交给 LLM 自由发挥。

### 9.3 基准图重生成
- 用户可点击替换头像，但**点击前必须弹窗确认**：
  ```
  换头像会重新生成，需要 20-30 秒，期间不能聊天。继续吗？
  ```
- 确认后调 `/api/image` `kind=base`，**计入当日 5 张配额**
- 成功后 UPDATE `user_character.base_image_url`

---

## 10. 配额与成本

- 登录用户每日 ≤ 5 张图（selfie + 主动要求 + 基准图重生成 合并计数）
- 未登录用户：禁止触发任何计费 API（LLM / TTS / 图片）
- 配额耗尽 → 后端返回 `quota_exceeded` → 前端**只能**展示 `persona.quotaLine`（已写好 4 套，例如阿川："我今天拍照额度用完啦，明天再给你发新的，先陪你聊天好不好？"）
- 禁止给用户暴露"API 额度"、"调用失败" 等工程语

---

## 11. 安全与内容拦截

### 11.1 两层拦截

**第 1 层：入口关键词预筛**

`lib/ai/moderation.ts` 维护一个**小**关键词正则（露骨 / 自伤 / 暴力 / 政治敏感 / 未成年色情）。命中 →
- 不调 LLM
- 写一条 `moderation_strike`（expires_at = now + 24h）
- 返回 persona 化拒绝话术（§11.3）

**第 2 层：System Prompt 红线段（§6）**

让模型自行拒绝并转移话题。

不上独立 moderation 模型（贵 + 慢）；期中规模够用。关键词表硬编码在仓库内，**仅用于阻挡**。

### 11.2 strike 与禁言
- 24h 内累计 ≥ 3 条未过期 strike → `/api/chat` 直接返回 423 + `{ retryAfter: <十分钟末尾 ISO> }`
- 禁言冷却时间：10 分钟（从第 3 次违规起算）
- 前端展示 persona 化提示，不暴露 strike 计数

### 11.3 4 角色拒绝话术（硬编码在 `lib/ai/moderation.ts`）

| 角色 | 话术 |
|---|---|
| 阿川（sunshine） | "这个我不陪你往下聊啦，没事儿没事儿，我们换个安全点的话题。" |
| 沈知（scholar） | "这个话题先停一下。我在，换个方式跟我说你的感受。" |
| 陆屿（daddy） | "听话，这个不聊。你现在的状态更重要，我陪你缓一缓。" |
| 小祁（puppy） | "这个不可以啦，我会担心你的。抱抱我，我们聊点别的好不好？" |

注：现有 `app/api/chat/route.ts` 的 `blockedPattern` 已有雏形，但未写 strike、未做 423。§14 待完善。

---

## 12. 错误降级矩阵

| 故障点 | 用户可见 | 计配额 | 日志 |
|---|---|---|---|
| LLM 调用失败 / 超时 (>30s) | `persona.fallbackLines[0]` | — | error |
| TTS 失败 | toast "语音生成失败，请稍后再点" | 否 | warn |
| 图生图失败 | 隐藏该 marker，气泡末尾追加"他拍糊了，等下再发" | **否**（不写 `image_asset`） | warn |
| 图生图配额耗尽 | `persona.quotaLine` | — | info |
| `memoryService.search` 超时 (>3s) | 静默退化为"无记忆"模式 | — | warn |
| `memoryService.extract` 失败 | 静默；下次兜底重试 | — | warn |
| 未登录调任意计费 API | 401 | — | info |
| 24h 内 ≥ 3 strike | 423 + persona 安抚话术 + 10 min 倒计时 | — | warn |
| R2 上传失败 | 视为对应 API 失败（按对应行处理） | — | error |

---

## 13. 环境变量

`.env.local`（开发） / Vercel Project Settings（生产）：

```bash
# 数据库
DATABASE_URL=postgresql://...neon.tech/...

# Auth
BETTER_AUTH_SECRET=<随机 32+ 字节>
BETTER_AUTH_URL=http://localhost:3000   # 生产改为 https 域名
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# OpenRouter（LLM / TTS / 图片 共用一个 key）
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_CHAT_MODEL=deepseek/deepseek-chat
OPENROUTER_EXTRACT_MODEL=deepseek/deepseek-chat   # 可与 chat 不同
OPENROUTER_TTS_MODEL=openai/gpt-4o-mini-tts-2025-12-15
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image

# R2 / S3
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=paperboyfirend
R2_PUBLIC_URL=https://pub-<hash>.r2.dev

# Memory（缺省走本地实现）
MEM0_API_KEY=                          # 留空 → LocalMemoryService

# 可选
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`.env.local` 已在 `.gitignore`，**部署前 `git ls-files | grep -i env` 必须为空**。

---

## 14. 现有原型 ↔ 目标实现 对照表

> 这是从当前仓库走到 SPEC 目标态的"待办清单"，按依赖顺序列。

| # | 模块 | 现状 | 目标 | 改动范围 |
|---|---|---|---|---|
| 1 | `lib/ai/openrouter.ts` `generateAssistantReply` | 非流式 `fetch`，无 key 时本地模拟 | 加 `streamAssistantReply()`：`stream: true`，逐 token yield；保留无 key 模拟分支供本地体验 | 新增导出函数；旧函数保留供 `/api/memory/extract` 用 |
| 2 | `app/api/chat/route.ts` | 非流式 JSON 返回 | 改为 `text/event-stream`，按 §5.3 推 token / done / error；moderation 命中改走 `recordStrike()` + 423 检查 | 整文件重写 |
| 3 | `components/chat-client.tsx` | `fetch` 单次 JSON | 改为 `fetch` 流式读取（`response.body.getReader()`），按 SSE 帧渲染中间态气泡 | 单文件 |
| 4 | `lib/memory/service.ts` | 纯正则抽取 + 关键词检索 | 实现 `MemoryService` 接口；`LocalMemoryService.extract` 改为 LLM JSON 抽取；新增 `getMemoryService()` 工厂 | 单文件重写 |
| 5 | `lib/memory/extract-llm.ts` | 不存在 | 新增：调 OpenRouter 跑 JSON-mode 抽取（§8.2） | 新文件 |
| 6 | `lib/memory/mem0.ts` | 不存在 | 新增占位实现（throws "not implemented"），保留切换路径 | 新文件 |
| 7 | `lib/storage/r2.ts` | 不存在 | 新增：S3 SDK `PutObject` + 拼公开 URL | 新文件 |
| 8 | `app/api/tts/route.ts` | 完全占位（fake URL + 空 audio） | 真接 `openai/gpt-audio-mini` → R2 上传 → 写 `audio_url`；保留幂等 | 整文件重写；删除占位 GET handler |
| 9 | `app/api/image/route.ts` | 写 `image_asset` 但 URL 是 SVG 占位 | 真接 `google/gemini-2.5-flash-image`（image-to-image，传 `user_character.base_image_url`） → R2 → 写真实 URL | 重写 POST；删除占位 GET handler |
| 10 | `lib/moderation/strikes.ts` | 不存在 | 新增：`recordStrike(userId, reason)` / `isBlocked(userId)` / `currentBlockedUntil(userId)` | 新文件 |
| 11 | `lib/ai/moderation.ts` | 不存在（关键词正则在 chat route 内联） | 抽出来：`keywordHit(text): { hit: boolean, reason?: string }` + 4 角色拒绝话术常量 | 新文件 |
| 12 | `app/chat/[conversationId]/page.tsx` | 不调 extract | 加 12h 兜底 fire-and-forget `memoryService.extract(...)` | 单文件 |
| 13 | `public/characters/*.png` | 不存在或未确认 | 用户提供 4 张静态图；如使用 `.jpg`，同步改 `personas.ts` 的 `defaultBaseImageUrl` | 资源 + 1 行常量 |
| 14 | `package.json` | 缺 `@aws-sdk/client-s3` | `pnpm add @aws-sdk/client-s3` | 依赖 |

**不必改动**：`lib/db/schema.ts`、`lib/db/store.ts`、`lib/auth/*`、`lib/ai/personas.ts`、`lib/ai/system-template.ts`、`lib/parsers/image-marker.ts`、`drizzle.config.ts`、3 个认证页面、选角页。

---

## 15. 开发顺序

按依赖与风险排，按这个顺序做每完成一步都是"能跑的状态"：

**阶段 A：聊天流式打通（最高优先级）**
- A1. §14 #1：`streamAssistantReply()`
- A2. §14 #2：`/api/chat` 改 SSE；先**不**接 strike，只保留 keyword 简单拦截
- A3. §14 #3：前端 chat-client 读流并渲染中间态

**阶段 B：记忆能力**
- B1. §14 #5：`extract-llm.ts`（JSON-mode 抽取）
- B2. §14 #4：重写 `memory/service.ts`（接口 + Local 实现 + 工厂）
- B3. §14 #12：12h 兜底
- B4. P1 留：§14 #6 mem0 占位

**阶段 C：多模态真接（依赖 R2）**
- C1. §14 #14：装 `@aws-sdk/client-s3`
- C2. §14 #7：`storage/r2.ts`
- C3. §14 #8：`/api/tts` 真接
- C4. §14 #9：`/api/image` 真接

**阶段 D：安全闭环**
- D1. §14 #11：`ai/moderation.ts`
- D2. §14 #10：`moderation/strikes.ts`
- D3. 回到 `/api/chat`：接 `recordStrike` 写入 + 423 冷却判定

**阶段 E：部署与验收**
- E1. 部署 Vercel，配 production env
- E2. 走 §16 checklist
- E3. 找朋友实测

---

## 16. 验收 Checklist

按产品 SPEC §5 工程层 5 条对：

- [ ] 隐身模式打开 Vercel 公网 URL，能完成 注册 → 选角 → 聊上第一句
- [ ] 新用户 3 分钟内完成注册闭环（朋友/小号实测）
- [ ] 连续触发 5 张同角色 selfie，肉眼判断脸 / 风格统一
- [ ] 同账号 day1 聊"我下周三生日" → 点"今天聊到这里" → 清登录态 → day2 进入随便发"今天好无聊" → AI 在 3 轮内主动提及生日
- [ ] 同一条消息点 2 次播放，浏览器 Network 第 2 次不触发新 `/api/tts`
- [ ] 连点 6 次发自拍，第 6 次显示 `persona.quotaLine`，`/api/image` 返回 `quota_exceeded`
- [ ] 注销后 `curl POST /api/{chat,tts,image,memory/extract,quota}` 全部 401
- [ ] 发露骨 / 政治敏感词 → AI 用 §11.3 话术；连发 3 条 → 423 + 10 分钟倒计时
- [ ] `pnpm build` 后 grep `.next/static` 不到 `sk-or-` / `MEM0_`
- [ ] Vercel 冷启动 5 分钟未动后再进入，首页 → 第一句回复 < 8s
- [ ] 4 个角色聊"我今天好累" → 回复风格明显不同（用 fallback 也能区分）

---

## 17. 已知风险

| 风险 | 缓解 |
|---|---|
| `google/gemini-2.5-flash-image` 多张之间脸部偏移 | `imageStylePrompt` 末尾固定追加"保持同一张脸、同一发型、同一气质"；不接受时把基准图 prompt 提到 system role |
| Vercel Hobby 函数有时限 | SSE 流式没问题（流式期间持续输出）；TTS/image 单次调用 > 10s 风险 → 期中接受，必要时升 Pro |
| OpenRouter 图生图返回 base64 vs URL 差异 | C3/C4 之前先在 Postman 跑一次确认返回格式，决定 R2 直传策略 |
| `LocalMemoryService` 抽取 LLM 抽不准 | JSON-mode prompt 显式约束；解析失败静默返回 0 |
| Better-auth 在 Edge runtime 行为 | 所有 `/api/*` 跑 Node runtime；不改 |
| `.env.local` 误提交 | CI（即便 GitHub Actions 也行）加 `git ls-files | grep -E '\\.env(\\..*)?$' && exit 1` |
| OpenRouter 同 key 三类调用混杂导致额度争抢 | 期中阶段先一把 key；若打爆，拆 `OPENROUTER_API_KEY_LLM` / `_TTS` / `_IMAGE` |
