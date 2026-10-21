// The review link sent to happy customers. Counts the first click, then forwards to the business's review page.
import { NextResponse } from "next/server";
import { globalQuery, withTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return new NextResponse("This link is not valid.", { status: 404 });
  const { rows } = await globalQuery<{ workspace_id: string; lead_id: string }>("select * from review_link_target($1)", [token]);
  const target = rows[0];
  if (!target) return new NextResponse("This link is not valid.", { status: 404 });
  const link = await withTenant(target.workspace_id, async (c) => {
    await c.query("update leads set review_clicked_at = coalesce(review_clicked_at, now()) where id = $1", [target.lead_id]);
    return (await c.query<{ review_link: string | null }>("select review_link from automation_settings where workspace_id = $1", [target.workspace_id])).rows[0]?.review_link;
  });
  // Only ever forward to an https address the business saved itself.
  if (!link || !/^https:\/\//.test(link)) return new NextResponse("This business has not set a review page yet.", { status: 404 });
  return NextResponse.redirect(link, 302);
}
