import { NextRequest, NextResponse } from "next/server";
import { prismadb } from "@/lib/prisma";

// Temporary testing tool: deletes ONLY the crm_YeastarContactSync mapping
// row for a given contact — does not touch the actual contact data in
// NextCRM, and does not touch or delete anything in Yeastar itself.
//
// Purpose: makes a contact look "never synced" again, so re-running the
// backfill will exercise the CREATE path instead of the UPDATE path —
// letting us test the backfill's actual real-world job (syncing legacy
// contacts nobody has manually touched) rather than contacts that already
// have a mapping from a manual save.
//
// Delete this file once you're done testing.
//
// Usage: visit in your browser
//   https://your-app.onrender.com/api/admin/reset-yeastar-sync?secret=YOUR_SECRET&contactId=THE_CONTACT_ID

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.ADMIN_BACKFILL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json({ error: "Missing contactId query param" }, { status: 400 });
  }

  const existing = await prismadb.crm_YeastarContactSync.findUnique({
    where: { crmContactId: contactId },
  });

  if (!existing) {
    return NextResponse.json({
      message: "No sync mapping found for this contact — it's already unsynced.",
      contactId,
    });
  }

  await prismadb.crm_YeastarContactSync.delete({ where: { crmContactId: contactId } });

  return NextResponse.json({
    message: "Sync mapping deleted. This contact will now take the CREATE path on next sync/backfill.",
    contactId,
    previousYeastarContactId: existing.yeastarContactId,
    note: "The old Yeastar contact still exists on the PBX — this only removed NextCRM's record of the link, it did not delete anything in Yeastar.",
  });
}
