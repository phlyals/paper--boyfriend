"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import type { PersonaPreset } from "@/lib/ai/personas";

type CardProps = {
  persona: PersonaPreset;
  position: number; // 0 = front
  total: number;
  isFront: boolean;
  loading: boolean;
  onShuffle: () => void;
  onPick: (slug: string) => void;
};

function StackCard({ persona, position, total, isFront, loading, onShuffle, onPick }: CardProps) {
  const denom = Math.max(1, total - 1);
  const rotate = -6 + (position * 12) / denom; // -6° → +6° 扇形铺开
  const xPercent = (position * 56) / denom;

  return (
    <motion.div
      style={{
        zIndex: total - position,
        borderColor: `${persona.color}55`,
      }}
      animate={{ rotate: `${rotate}deg`, x: `${xPercent}%` }}
      drag={isFront ? "x" : false}
      dragElastic={0.35}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -150) onShuffle();
      }}
      transition={{ duration: 0.35 }}
      className={`absolute left-0 top-0 flex h-[460px] w-[300px] select-none flex-col rounded-2xl border-2 bg-white p-5 shadow-xl ${
        isFront ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      <div
        className="relative mx-auto h-28 w-28 overflow-hidden rounded-full border-[3px]"
        style={{ borderColor: persona.color }}
      >
        <Image
          src={persona.defaultBaseImageUrl}
          alt={persona.displayName}
          fill
          sizes="112px"
          className="object-cover"
          draggable={false}
        />
      </div>

      <h2 className="mt-4 text-center text-xl font-semibold">{persona.shortName}</h2>
      <p className="mt-1 text-center text-xs uppercase tracking-widest text-[#667085]">
        {persona.displayName}
      </p>
      <p className="mt-4 line-clamp-5 text-center text-sm leading-6 text-[#344054]">
        {persona.personaCore}
      </p>

      <button
        className="tap mt-auto rounded-lg px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: persona.color }}
        onClick={(event) => {
          event.stopPropagation();
          onPick(persona.slug);
        }}
        disabled={loading || !isFront}
      >
        {loading ? "进入中…" : `选 ${persona.shortName}`}
      </button>
    </motion.div>
  );
}

export function PickClient({ personas }: { personas: PersonaPreset[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [frontIndex, setFrontIndex] = useState(0);

  const total = personas.length;

  function shuffle() {
    setFrontIndex((prev) => (prev + 1) % total);
  }

  async function choose(slug: string) {
    setLoading(slug);
    try {
      const response = await fetch("/api/character/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetSlug: slug }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.conversationId) router.push(`/chat/${data.conversationId}`);
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="relative mx-auto mt-6 h-[500px] w-full max-w-[500px]">
      {personas.map((persona, originalIndex) => {
        const position = (originalIndex - frontIndex + total) % total;
        return (
          <StackCard
            key={persona.slug}
            persona={persona}
            position={position}
            total={total}
            isFront={position === 0}
            loading={loading === persona.slug}
            onShuffle={shuffle}
            onPick={choose}
          />
        );
      })}
      <p className="absolute -bottom-8 left-0 right-0 text-center text-xs text-[#667085]">
        ← 向左拖动卡片切换 · 点底部按钮开始聊天
      </p>
    </div>
  );
}
