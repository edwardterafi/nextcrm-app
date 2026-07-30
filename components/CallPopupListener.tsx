"use client";

import { useEffect } from "react";

type IncomingCallEvent = {
  callId: string;
  callerNumber: string;
  contactId: string | null;
};

export function CallPopupListener() {
  useEffect(() => {
    const source = new EventSource("/api/yeastar/events");

    source.onmessage = (e) => {
      try {
        const data: IncomingCallEvent = JSON.parse(e.data);
        if (data.contactId) {
          window.open(`/crm/contacts/${data.contactId}`, "_blank");
        }
      } catch {}
    };

    return () => source.close();
  }, []);

  return null;
}
