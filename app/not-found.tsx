import Link from "next/link";

export default function NotFound() {
  return (
    <main className="safe-page grid place-items-center px-5">
      <div className="text-center">
        <p className="text-6xl font-bold text-white/10">404</p>
        <h1 className="mt-4 text-xl font-semibold text-white">找不到这个页面</h1>
        <p className="mt-2 text-sm text-white/50">他可能去别处等你了…</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-[#2f8f83] px-5 py-2.5 text-sm font-medium text-white"
          >
            回到首页
          </Link>
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
