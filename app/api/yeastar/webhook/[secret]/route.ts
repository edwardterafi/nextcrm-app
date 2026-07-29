import { NextRequest, NextResponse } from "next/server";

// Yeastar P-Series Cloud Edition's Webhook Event Push doesn't sign requests
// natively, so we use a shared secret embedded in the URL path as a
// lightweight verification method instead.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;

  if (secret !== process.env.YEASTAR_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Yeastar Webhook] Event received:", JSON.stringify(body));

  return NextResponse.json({ received: true }, { status: 200 });
}
