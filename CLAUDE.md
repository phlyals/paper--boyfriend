# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

中文虚拟陪伴聊天 Web 应用（"纸片人男友 2.0"）。核心卖点是 **"他真的记得我"**——记忆功能比浪漫剧情更重要。这是一份带交付期限的期中作业，决策上优先选"稳、能跑、能讲清楚"，但**关键体验环节（聊天流式、记忆质量）不让步**。

## 权威文档

- [docs/tech-spec.md](docs/tech-spec.md) 是**当前唯一权威技术 SPEC**，覆盖决策快照（§0）、选型、目录、schema、API 契约、Prompt、流程、记忆、错误降级、环境变量、**现状↔目标对照表（§14）**、开发顺序、验收 checklist。
- 实现细节有歧义时以 SPEC 为准。**已被删除**的 `tech-spec-final.md` 是过时草稿，不要恢复或引用。
- 产品 SPEC（"做什么/不做什么/成功标准"）目前只在对话上下文里，没落盘。对产品边界有疑问先问用户，不要凭印象推断。

## 常用命令

```bash
pnpm dev                # 本地开发（http://localhost:3000）
pnpm build              # 生产构建
pnpm start              # 跑构建产物
pnpm lint               # next lint
pnpm typecheck          # tsc --noEmit；CI 应该跑这个，不是 build
pnpm db:generate        # 根据 lib/db/schema.ts 生成迁移到 lib/db/migrations/
pnpm db:push            # 直接 push schema 到 Neon（开发期常用，跳过 migration 文件）
```

没有测试框架。验收用 SPEC §16 的人工 checklist。

## 仓库现状

仓库**不是空白起步**：原型已铺好框架（页面、API route、schema、persona 常量），但有 3 处是占位 / 弱实现，SPEC §14 列了详细对照。简要：

- **可用**：DB schema、auth helpers、personas 常量、selectCharacter / quota / conversation API、原型聊天 UI。
- **占位**：`/api/tts` 返回 fake URL + 空 audio；`/api/image` 返回 SVG 占位（未真接 Gemini）；R2 / 对象存储未集成。
- **需重写**：`/api/chat`（要改 SSE 流式）、`lib/memory/service.ts`（要改 LLM 抽取 + 接口抽象）、关键词拦截要拆出独立模块并接 strike 计数。

## 关键架构约定

### 1. SSE 流式聊天

`/api/chat` 输出 `text/event-stream`，逐 token 推到前端，结束推 `event: done` 含 `{ messageId, imageMarkers }`。**不要**回退成一次性 JSON——`docs/tech-spec.md §0/§5.3` 已锁定流式。

服务端在流结束**之后**才落 assistant 消息（带 `image_markers`），不在 token 阶段写 DB。

### 2. 记忆走接口抽象

`lib/memory/service.ts` 暴露 `MemoryService` 接口（`search` + `extract`）。`getMemoryService()` 工厂根据 `MEM0_API_KEY` 是否存在返回 `LocalMemoryService`（MVP）或 `Mem0MemoryService`（P1 占位）。

**API Route 只依赖接口**，不直接 import 具体实现。这样后续切 mem0 只动一个文件。

`LocalMemoryService.extract` 用**便宜 LLM JSON-mode 抽取**，不要用正则。正则只能捕固定句式，撑不起情绪/近况维度。

### 3. Persona 数据双重存储

4 个角色的文本在 [lib/ai/personas.ts](lib/ai/personas.ts) 里硬编码（名字：阿川/沈知/陆屿/小祁），是 source of truth。数据库 `character_preset` 表只是镜像，首次访问时通过 [lib/db/store.ts](lib/db/store.ts) 的 `ensureCharacterPreset(slug)` upsert 进去。

**改 persona 文案 → 改 TS 文件**；不要直接 SQL 改 `character_preset`，下次 `ensureCharacterPreset` 会覆盖回 TS 版本。`presetRowToPersona()` 还原 DB 行为 `PersonaPreset`，DB 没有的字段用 TS 版本兜底。

`PersonaPreset` 自带 `fallbackLines[]`（LLM 失败兜底）、`quotaLine`（配额耗尽人设话术）、`imageStylePrompt`（图生图风格约束），不要在调用点重新发明这些。

### 4. 服务端边界

所有可能消耗钱（LLM/TTS/图片/embedding）的逻辑必须在 API Routes 里。`lib/` 下凡是 server-only 的文件首行都标了 `import "server-only"`——保留这条约束，新增 server 模块也要加。

API key（`OPENROUTER_API_KEY`、`MEM0_API_KEY`、`R2_*` 等）只允许在 API Route 读 `process.env`，**禁止**通过 `NEXT_PUBLIC_*` 暴露给前端。`.env.local` 已通过 `.gitignore` 排除。

### 5. Auth helpers（三种用法各有适用场景）

[lib/auth/session.ts](lib/auth/session.ts) 导出：

- `getCurrentUser()` — 不抛错，返回 `User | null`，公开页面/可选鉴权用。
- `requireUser()` — 服务端组件用，未登录直接 `redirect("/login")`。
- `requireApiUser()` — API Route 用，返回 `{ user, response }`，未登录给现成的 401 `Response`。

**API Route 里不要用 `requireUser()`**——它会触发 redirect，行为不符合预期。

### 6. 图片配额按上海时区算

[lib/db/store.ts](lib/db/store.ts) 的 `todayStartDate()` 用 `Asia/Shanghai` 截取一天起点，`countTodayImages(userId)` 统计 `image_asset` 行数。配额 = 5，三类（selfie / 主动要求 / 基准图重生成）合并计数。

**配额耗尽时不要给前端工程错误**——返回 `quota_exceeded`，让前端展示 `persona.quotaLine`（已 4 套写好）。

### 7. `[IMAGE: 描述]` 是 LLM↔前端协议

LLM 在文末输出 `[IMAGE: ...]` 表示想发自拍。[lib/parsers/image-marker.ts](lib/parsers/image-marker.ts) 在服务端剥离标记，描述存到 `message.image_markers` (JSONB)。前端拿到 messageId 后**单独调** `/api/image`，再把结果填进 `message.image_urls[markerIndex]`。

**不要**在 LLM 输出阶段同步生成图——会把聊天阻塞 10–30s（这点跟流式聊天约定也强耦合）。

### 8. NSFW / 安全是两层 + strike 计数

- 第 1 层：`lib/ai/moderation.ts` 关键词预筛（命中不调 LLM，直接返回 §11.3 4 套人设话术之一）
- 第 2 层：system prompt 红线段（让模型自己 refuse）
- 命中第 1 层 → `lib/moderation/strikes.ts` 写一条 `moderation_strike`（expires = now + 24h）
- 24h 内 ≥ 3 条未过期 → `/api/chat` 直接返回 423 + 10 分钟冷却
- 当前 `app/api/chat/route.ts` 只有最简单的关键词正则雏形，未写 strike、未做 423，**SPEC §14 #10/#11 待补**

### 9. better-auth schema 不自定义

`lib/db/schema.ts` 里 `user` / `session` / `account` / `verification` 严格按 better-auth 默认 schema，不要加业务字段。需要扩展时挂业务表（外键到 `user.id`）。`user.id` 是文本 UUID，所有业务表的 `userId` 都用 `text(...).references(() => user.id)`。

### 10. 路径别名

`tsconfig.json` 配了 `@/*` → 仓库根。新代码统一用 `@/lib/...`、`@/components/...`，不要用相对路径回溯。

## 文件与目录速查

- `app/api/*` — 8 个 route，对应 SPEC §5 契约
- `app/(login|register|pick|chat)/` — 页面，鉴权失败统一跳 `/login`（见 `app/page.tsx` 入口逻辑）
- `lib/db/store.ts` — 业务侧 DB 访问入口；新增跨表查询往这里放
- `lib/ai/system-template.ts` — system prompt 拼装入口；memory 注入也走这里
- `public/characters/{sunshine,scholar,daddy,puppy}.png` — 4 张默认基准图，由用户手放置，文件名必须与 `personas.ts` 的 `defaultBaseImageUrl` 对齐
- `.data/` — 已 gitignore 的旧本地原型痕迹，**不是**当前数据源；不要往里读写

## 期中开发期的特殊约束

- **追求"能跑、能讲清楚"而不是"完美架构"**。SPEC §14 是从现状走到目标的对照清单，§15 是开发顺序；不要一开始就追求 production-grade。
- 默认 DB 连接走 Neon serverless HTTP（`@neondatabase/serverless`），本地 dev 也走同一个 Neon 实例。
- 部署目标是 Vercel，所有 API Route 默认 Node runtime；如未来引入 Edge runtime，要先确认 better-auth 在 Edge 下的行为。
