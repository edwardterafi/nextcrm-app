import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  const expectedSignature = crypto
    .createHmac("sha256", process.env.YEASTAR_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("base64");

  if (!signature || signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Yeastar Webhook] Event received:", JSON.stringify(body));

  return NextResponse.json({ received: true }, { status: 200 });
}
