import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function computeSignature(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  const validSecrets = [
    process.env.YEASTAR_WEBHOOK_SECRET,
    process.env.YEASTAR_WEBHOOK_SECRET_2,
  ].filter(Boolean) as string[];

  const isValid = validSecrets.some(
    (secret) => signature === computeSignature(secret, rawBody)
  );

  if (!signature || !isValid) {
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
