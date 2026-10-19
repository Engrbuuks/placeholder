import { appConfig } from "@/lib/config";
import { Wordmark } from "./Wordmark";
import { SphereArt } from "./art";

export function AuthShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  const copy = appConfig.auth;
  return (
    <div className="mx-auto grid min-h-screen max-w-[1240px] gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_1fr]">
      <main className="flex flex-col px-2 py-4 sm:px-8">
        <Wordmark />
        <div className="my-auto w-full max-w-md py-12">
          <h1 className="text-[2.75rem]">{title}</h1>
          <p className="mt-3 text-ink-soft">{intro}</p>
          <div className="mt-10">{children}</div>
        </div>
      </main>
      <aside className="relative hidden overflow-hidden rounded-[28px] bg-accent p-10 lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/25 blur-3xl" />
        <p className="label relative text-ink/75">{appConfig.name}</p>
        <h2 className="relative mt-4 max-w-[14ch] text-[2.6rem] text-ink">{copy.panelHeading}</h2>
        <div className="relative mx-auto my-auto w-full max-w-[380px] py-8">
          <SphereArt />
        </div>
        <ul className="relative mt-8 space-y-2">
          {copy.panelList.map((item) => (
            <li key={item} className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.06em] text-ink">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink" />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
