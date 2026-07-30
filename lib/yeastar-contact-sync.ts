import { prismadb } from "@/lib/prisma";
import {
  createYeastarContact,
  updateYeastarContact,
  deleteYeastarContact,
} from "@/lib/yeastar-api";

// One-way sync: NextCRM -> Yeastar only. Call this from your existing
// contact create/update/delete server actions, right after the
// crm_Contacts mutation succeeds. No polling, no conflict resolution —
// NextCRM is always the source of truth.

export async function syncContactToYeastar(
  crmContactId: string,
  action: "upsert" | "delete"
) {
  const syncRecord = await prismadb.crm_YeastarContactSync.findUnique({
    where: { crmContactId },
  });

  if (action === "delete") {
    if (syncRecord) {
      await deleteYeastarContact(syncRecord.yeastarContactId);
      await prismadb.crm_YeastarContactSync.delete({ where: { crmContactId } });
    }
    return;
  }

  const contact = await prismadb.crm_Contacts.findUnique({
    where: { id: crmContactId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      mobile_phone: true,
      office_phone: true,
    },
  });
  if (!contact) return;

  const numbers = [
    contact.mobile_phone && { num_type: "mobile_number" as const, number: contact.mobile_phone },
    contact.office_phone && { num_type: "business_number" as const, number: contact.office_phone },
  ].filter(Boolean) as { num_type: "mobile_number" | "business_number"; number: string }[];

  // Nothing to call/match on in Yeastar without at least one number.
  if (numbers.length === 0) return;

  if (syncRecord) {
    await updateYeastarContact(syncRecord.yeastarContactId, {
      firstName: contact.first_name ?? undefined,
      lastName: contact.last_name ?? undefined,
      email: contact.email ?? undefined,
      numbers,
    });
  } else {
    const yeastarId = await createYeastarContact({
      firstName: contact.first_name ?? "Unnamed",
      lastName: contact.last_name ?? undefined,
      email: contact.email ?? undefined,
      numbers,
    });
    await prismadb.crm_YeastarContactSync.create({
      data: { crmContactId, yeastarContactId: yeastarId },
    });
  }
}
