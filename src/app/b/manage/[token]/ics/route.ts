import { bookingForToken, icsFor } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await bookingForToken(token);
  if (!found || found.booking.status !== "confirmed") return new Response("Not found", { status: 404 });
  return new Response(icsFor(found.booking, found.settings.title, found.ctx.businessName), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="booking.ics"', "cache-control": "no-store" },
  });
}
