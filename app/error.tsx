"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="safe-page grid place-items-center px-5">
      <div className="text-center">
        <p className="text-6xl font-bold text-white/10">500</p>
        <h1 className="mt-4 text-xl font-semibold text-white">出了点小问题</h1>
        <p className="mt-2 text-sm text-white/50">别担心，刷新一下通常就好了。</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            className="rounded-lg bg-[#2f8f83] px-5 py-2.5 text-sm font-medium text-white"
            onClick={reset}
          >
            重试
          </button>
          <button
            className="text-sm text-white/40 hover:text-white/70"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).Tawk_API?.toggle?.();
            }}
          >
            遇到问题？联系我们
          </button>
        </div>
      </div>
    </main>
  );
}
