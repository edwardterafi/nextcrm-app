import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prismadb } from "@/lib/prisma";
import { callEventEmitter } from "@/lib/call-events";

function computeSignature(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-9);
}

function parseCdrTimestamp(raw: string): Date {
  const offsetHours = Number(process.env.YEASTAR_PBX_UTC_OFFSET_HOURS ?? 0);
  const naiveUtc = new Date(raw.replace(" ", "T") + "Z");
  return new Date(naiveUtc.getTime() - offsetHours * 60 * 60 * 1000);
}

async function findContactByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const contacts = await prismadb.crm_Contacts.findMany({
    where: {
      deletedAt: null,
      OR: [{ mobile_phone: { not: null } }, { office_phone: { not: null } }],
    },
    select: { id: true, mobile_phone: true, office_phone: true, first_name: true, last_name: true },
  });

  return (
    contacts.find(
      (c) =>
        normalizePhone(c.mobile_phone) === normalized ||
        normalizePhone(c.office_phone) === normalized
    ) ?? null
  );
}

type CallMember = {
  extension?: { number: string; member_status: string };
  internal?: { from: string; to: string; member_status: string };
  trunk?: { from: string; to: string; member_status: string };
  inbound?: {
    from: string;
    to: string;
    trunk_name: string;
    member_status: string;
  };
};

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

  // --- (30011) Call Status Changed: fires the instant a call rings.
  // Used to trigger the real-time contact pop-up in the browser.
  if (envelope.type === 30011 && envelope.msg) {
    try {
      const statusMsg: { call_id: string; members: CallMember[] } = JSON.parse(envelope.msg);

      const hasRingingExtension = statusMsg.members?.some(
        (m) =>
          m.extension?.member_status === "RING" ||
          m.trunk?.member_status === "RING"
      );

      // Internal calls always carry an "internal" key on one of the
      // members — skip those, we only want to pop external inbound calls.
      const isInternalCall = statusMsg.members?.some((m) => m.internal);

      if (hasRingingExtension && !isInternalCall) {
        // The RING status lands on the "extension" member, but the actual
        // caller number lives on a *sibling* member tagged "inbound"
        // (member_status will read "ALERT" there, not "RING"). Pull the
        // number from that member, not from whichever one says RING.
        const inboundMember = statusMsg.members?.find((m) => m.inbound);
        const callerNumber = inboundMember?.inbound?.from ?? "";

        console.log(
          "[Yeastar Webhook] RING detected, extracted callerNumber:",
          callerNumber,
          "raw members:",
          JSON.stringify(statusMsg.members)
        );

        if (callerNumber) {
          const contact = await findContactByPhone(callerNumber);
          callEventEmitter.emit("incoming-call", {
            callId: statusMsg.call_id,
            callerNumber,
            contactId: contact?.id ?? null,
          });
        }
      }
    } catch (err) {
      console.log("[Yeastar Webhook] Failed to parse 30011 payload:", err);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  }

  // --- (30012) New CDR: fires once per completed call, used for logging.
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
  const matchedContact = await findContactByPhone(externalNumber);

  const activity = await prismadb.crm_Activities.create({
    data: {
      type: "call",
      title: `${cdr.type} call ${matchedContact ? `with ${matchedContact.first_name ?? ""} ${matchedContact.last_name}` : `from ${externalNumber}`}`,
      description: `${cdr.type} call, status: ${cdr.status}`,
      date: parseCdrTimestamp(cdr.time_start),
      duration: cdr.talk_duration,
      status: "completed",
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
