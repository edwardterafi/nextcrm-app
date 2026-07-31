import { NextRequest, NextResponse } from "next/server";
import { prismadb } from "@/lib/prisma";
import { syncContactToYeastar } from "@/lib/yeastar-contact-sync";

// Temporary, one-time-use endpoint to backfill existing contacts to
// Yeastar. Protected by a secret so random visitors can't trigger it.
// Delete this file once you've run it — it's not meant to be permanent.
//
// Trigger it by visiting, in your browser (while logged in doesn't
// matter, this checks its own secret, not your session):
//
//   https://your-app.onrender.com/api/admin/yeastar-backfill?secret=YOUR_SECRET
//
// Set ADMIN_BACKFILL_SECRET as an env var on Render first — anything
// random and hard to guess works, it's just a one-time gate.

const DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.ADMIN_BACKFILL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prismadb.crm_Contacts.findMany({
    where: { deletedAt: null },
    select: { id: true, first_name: true, last_name: true },
  });

  const results: { id: string; name: string; status: "ok" | "error"; error?: string }[] = [];

  for (const contact of contacts) {
    const label = `${contact.first_name ?? ""} ${contact.last_name}`.trim();
    try {
      await syncContactToYeastar(contact.id, "upsert");
      results.push({ id: contact.id, name: label, status: "ok" });
    } catch (error) {
      results.push({
        id: contact.id,
        name: label,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(DELAY_MS);
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    total: contacts.length,
    succeeded,
    failed,
    results,
  });
}
