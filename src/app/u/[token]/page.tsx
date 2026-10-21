import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { leadForToken, unsubscribe } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

async function confirm(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  await unsubscribe(token);
  redirect(`/u/${token}?done=1`);
}

// Opening the link only asks. Nothing changes until the person presses the button, so email link
// scanners cannot unsubscribe anyone. Mail apps' one click button uses /api/unsubscribe instead.
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  if (!(await leadForToken(token))) notFound();
  const done = (await searchParams).done ? await unsubscribe(token) : null;
  return (
    <main className="min-h-dvh bg-paper px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
        {done ? (
          <>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Done</h1>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">{done.message}</p>
          </>
        ) : (
          <form action={confirm}>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Stop these messages?</h1>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">You will not get any more automatic emails or messages from this business.</p>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="mt-5 rounded-full bg-ink px-5 py-2.5 font-medium text-white hover:bg-ink/85">
              Unsubscribe
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
