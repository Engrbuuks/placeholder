// Downloads everything held about one customer as a JSON file, for data access requests.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exportCustomer } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const data = await exportCustomer(session.workspaceId, id);
  if (!data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="customer-data-${id.slice(0, 8)}.json"`,
      "cache-control": "no-store",
    },
  });
}
