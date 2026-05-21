import Script from "next/script";
import { requireUser } from "@/lib/auth/session";
import { personaList } from "@/lib/ai/personas";
import { PickClient } from "@/components/pick-client";

export default async function PickPage() {
  await requireUser();
  return (
    <main className="safe-page mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 text-center sm:mb-7">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">选一个今天陪你的人</h1>
        <p className="mt-2 text-sm text-white/50 sm:text-base">向左拖卡片切换角色，看到喜欢的就点底部按钮。</p>
      </div>
      <PickClient personas={personaList} />
      <Script id="tawk-to" strategy="afterInteractive">{`
        var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
        (function(){
          var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
          s1.async=true;
          s1.src='https://embed.tawk.to/6a0f348f2515ce1c382f0a08/1jp5makab';
          s1.charset='UTF-8';
          s1.setAttribute('crossorigin','*');
          s0.parentNode.insertBefore(s1,s0);
        })();
      `}</Script>
    </main>
  );
}
