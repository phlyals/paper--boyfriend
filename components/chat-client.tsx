"use client";

import Image from "next/image";
import { LogOut, Mic2, Send, Sparkles, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "@/lib/db/store";
import type { PersonaSlug } from "@/lib/ai/personas";
import { authClient } from "@/lib/auth/client";

type ChatPersona = {
  slug: PersonaSlug;
  displayName: string;
  shortName: string;
  color: string;
  baseImageUrl: string;
  quotaLine: string;
};

type SsePayload =
  | { type: "token"; value: string }
  | { type: "done"; messageId: string; imageMarkers: string[]; text?: string }
  | { type: "error"; code: string };

function parseFrame(frame: string): SsePayload | null {
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      return JSON.parse(raw) as SsePayload;
    } catch {
      return null;
    }
  }
  return null;
}

export function ChatClient({
  conversationId,
  initialMessages,
  persona,
}: {
  conversationId: string;
  initialMessages: Message[];
  persona: ChatPersona;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  // 新消息 / token 增量到来时自动滚到底，跟微信一样。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sorted, notice]);

  // 粒子参数只算一次，避免每次 render 抖动。
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        duration: 7 + Math.random() * 5,
        delay: Math.random() * 6,
        drift: (Math.random() * 80 - 40).toFixed(0) + "px",
        size: 2 + Math.random() * 3,
      })),
    [],
  );

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    setBusy(true);
    setNotice("");

    // 乐观插入用户气泡 + 一条占位的 assistant 气泡，token 流到达时增量填充。
    const now = new Date().toISOString();
    const userTempId = `pending-user-${Date.now()}`;
    const assistantTempId = `pending-assistant-${Date.now()}`;
    const userOptimistic: Message = {
      id: userTempId,
      conversationId,
      role: "user",
      content: value,
      imageMarkers: [],
      imageUrls: [],
      createdAt: now,
    };
    const assistantOptimistic: Message = {
      id: assistantTempId,
      conversationId,
      role: "assistant",
      content: "",
      imageMarkers: [],
      imageUrls: [],
      createdAt: new Date(Date.now() + 1).toISOString(),
    };
    setMessages((current) => [...current, userOptimistic, assistantOptimistic]);

    let finalAssistantId: string | null = null;
    let finalImageMarkers: string[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: value }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 423 && data.personaLine) {
          const minutes = Math.max(1, Math.ceil(Number(data.retryAfterSec ?? 600) / 60));
          setNotice(`${data.personaLine}（${minutes} 分钟后再聊）`);
        } else {
          setNotice(data.error ?? "发送失败");
        }
        // 移除占位
        setMessages((current) =>
          current.filter((m) => m.id !== userTempId && m.id !== assistantTempId),
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        let frameEnd = buffer.indexOf("\n\n");
        while (frameEnd !== -1) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          const payload = parseFrame(frame);
          if (payload) handlePayload(payload);
          frameEnd = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      console.error(err);
      setNotice("连接中断，请重试");
    } finally {
      setBusy(false);
    }

    if (finalAssistantId && finalImageMarkers.length > 0) {
      void generateImage(finalAssistantId, 0);
    }

    function handlePayload(payload: SsePayload) {
      if (payload.type === "token") {
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantTempId ? { ...m, content: m.content + payload.value } : m,
          ),
        );
      } else if (payload.type === "done") {
        finalAssistantId = payload.messageId;
        finalImageMarkers = payload.imageMarkers ?? [];
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantTempId
              ? {
                  ...m,
                  id: payload.messageId,
                  // 用服务端的 finalText 兜底：流式 token 没到（如 LLM 失败走 fallback）时仍能渲染。
                  content: payload.text && payload.text.length > 0 ? payload.text : m.content,
                  imageMarkers: payload.imageMarkers ?? [],
                }
              : m,
          ),
        );
      } else if (payload.type === "error") {
        setNotice(payload.code === "llm_unavailable" ? "他好像走神了，再说一遍？" : "出错了，稍后再试");
      }
    }
  }

  async function generateImage(messageId: string, markerIndex: number) {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "selfie", messageId, markerIndex }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error === "quota_exceeded" ? persona.quotaLine : "照片生成失败，等下再试。");
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              imageUrls: Object.assign([...message.imageUrls], { [markerIndex]: data.imageUrl }),
            }
          : message,
      ),
    );
  }

  async function play(messageId: string) {
    if (messageId.startsWith("pending-")) {
      setNotice("话还没说完，再等等。");
      return;
    }
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice("语音生成失败，请稍后再点。");
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = data.audioUrl;
    void audioRef.current.play().catch(() => setNotice("浏览器拦截了播放，请再点一次。"));
  }

  async function endSession() {
    // 抽取异步进行，不阻塞 UI，也不向用户暴露"已记住 N 件事"这种工程语。
    void fetch("/api/memory/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch(() => {});
    setNotice("好，今天就到这里。路上注意，我都记得。");
  }

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="chat-shell flex flex-col">
      {/* 浮动粒子层（z-0），其它内容 z-10 浮在上面 */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="chat-particle"
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--drift": p.drift,
            } as React.CSSProperties
          }
        />
      ))}

      <header className="relative z-10 flex items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
        <Image
          src={persona.baseImageUrl}
          alt={persona.shortName}
          width={44}
          height={44}
          className="rounded-full ring-2 ring-white/20"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-white">{persona.shortName}</h1>
          <p className="truncate text-xs text-white/50">{persona.displayName}</p>
        </div>
        <button
          className="tap rounded-md p-2 text-white/60 hover:text-white"
          onClick={() => router.push("/pick")}
          title="换角色"
        >
          <SquarePen size={19} />
        </button>
        <button
          className="tap rounded-md p-2 text-white/60 hover:text-white"
          onClick={logout}
          title="退出"
        >
          <LogOut size={19} />
        </button>
      </header>

      <section
        ref={scrollRef}
        className="relative z-10 flex-1 space-y-4 overflow-y-auto px-4 py-5"
      >
        {sorted.length === 0 ? (
          <div className="mx-auto mt-20 max-w-xs text-center text-sm leading-6 text-white/55">
            <Sparkles className="mx-auto mb-3" />
            他已经在线了，发第一句话吧。
          </div>
        ) : null}
        {sorted.map((message) => {
          const isTyping =
            message.role === "assistant" &&
            message.content === "" &&
            message.id.startsWith("pending-");
          const expectedImageCount = message.imageMarkers?.length ?? 0;
          return (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.role === "user"
                    ? "max-w-[78%] rounded-xl border border-white/15 bg-white/20 px-3 py-2 text-sm leading-6 text-white shadow-md backdrop-blur-md"
                    : "max-w-[78%] rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm leading-6 text-white shadow-md backdrop-blur-md"
                }
              >
                {isTyping ? (
                  <span className="typing-dots" aria-label="对方正在输入">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}

                {/* 图片渲染：按 imageMarkers 长度循环，已有 url 显示图，没有显示占位 */}
                {Array.from({ length: expectedImageCount }).map((_, index) => {
                  const url = message.imageUrls?.[index];
                  if (url) {
                    return (
                      <Image
                        key={`${url}-${index}`}
                        src={url}
                        alt="自拍"
                        width={260}
                        height={340}
                        className="mt-2 rounded-md object-cover"
                      />
                    );
                  }
                  return (
                    <div key={`placeholder-${index}`} className="image-placeholder">
                      正在发照片…
                    </div>
                  );
                })}

                {message.role === "assistant" && !isTyping ? (
                  <button
                    className="tap mt-2 inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/75 hover:bg-white/10 disabled:opacity-50"
                    onClick={() => play(message.id)}
                    disabled={message.id.startsWith("pending-") || !message.content}
                  >
                    <Mic2 size={14} />
                    播放
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {notice ? (
          <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white/70 backdrop-blur-md">
            {notice}
          </p>
        ) : null}
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-black/40 p-3 backdrop-blur-md">
        <div className="mb-2 flex justify-end">
          <button
            className="tap rounded-md px-3 py-1.5 text-sm text-white/65 hover:text-white"
            onClick={endSession}
          >
            今天聊到这里
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            className="max-h-28 min-h-11 flex-1 resize-none rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-white/35 outline-none focus:border-white/40"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="跟他说点什么..."
          />
          <button
            className="tap grid h-11 w-11 place-items-center rounded-md text-white shadow-lg disabled:opacity-60"
            style={{ background: persona.color }}
            onClick={send}
            disabled={busy}
            title="发送"
          >
            <Send size={19} />
          </button>
        </div>
      </footer>
    </main>
  );
}
