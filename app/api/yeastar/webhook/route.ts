import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prismadb } from "@/lib/prisma";

function computeSignature(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-9);
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

  let envelope: { type?: number; msg?: string };
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Yeastar Webhook] Envelope:", JSON.stringify(envelope));

  if (envelope.type !== 30012 || !envelope.msg) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  let cdr: {
    call_id: string;
    time_start: string;
    call_from: string;
    call_to: string;
    call_duration: number;
    talk_duration: number;
    status: string;
    type: string;
  };
  try {
    cdr = JSON.parse(envelope.msg);
  } catch {
    return NextResponse.json({ error: "Invalid CDR payload" }, { status: 400 });
  }

  if (cdr.type === "Internal") {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  const externalNumber = cdr.type === "Inbound" ? cdr.call_from : cdr.call_to;
  const normalizedExternal = normalizePhone(externalNumber);

  const contacts = await prismadb.crm_Contacts.findMany({
    where: {
      deletedAt: null,
      OR: [{ mobile_phone: { not: null } }, { office_phone: { not: null } }],
    },
    select: { id: true, mobile_phone: true, office_phone: true, first_name: true, last_name: true },
  });

  const matchedContact = contacts.find(
    (c) =>
      normalizePhone(c.mobile_phone) === normalizedExternal ||
      normalizePhone(c.office_phone) === normalizedExternal
  );

  const activity = await prismadb.crm_Activities.create({
    data: {
      type: "call",
      title: `${cdr.type} call ${matchedContact ? `with ${matchedContact.first_name ?? ""} ${matchedContact.last_name}` : `from ${externalNumber}`}`,
      description: `${cdr.type} call, status: ${cdr.status}`,
      date: new Date(cdr.time_start),
      duration: cdr.talk_duration,
      outcome: cdr.status,
      metadata: cdr,
    },
  });

  if (matchedContact) {
    await prismadb.crm_ActivityLinks.create({
      data: {
        activityId: activity.id,
        entityType: "contact",
        entityId: matchedContact.id,
      },
    });
  }

  console.log(
    `[Yeastar Webhook] Logged call activity ${activity.id}${matchedContact ? ` linked to contact ${matchedContact.id}` : " (no contact match)"}`
  );

  return NextResponse.json({ received: true }, { status: 200 });
}
