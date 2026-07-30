"use client";
import { useEffect } from "react";

type IncomingCallEvent = {
  callId: string;
  callerNumber: string;
  contactId: string | null;
};

export function CallPopupListener() {
  useEffect(() => {
    let isLeader = false;
    let released = false;

    // Only one tab across the whole browser should act on incoming-call
    // events. Every open tab runs this listener and gets the same SSE
    // broadcast, so without this lock each tab opens its own popup for
    // the same call. Whichever tab acquires the lock becomes the sole
    // handler until it closes; the lock then passes to another open tab.
    navigator.locks.request("call-popup-leader", { mode: "exclusive" }, () => {
      if (released) return;
      isLeader = true;
      return new Promise<void>(() => {}); // hold the lock for the tab's lifetime
    });

    const source = new EventSource("/api/yeastar/events");
    source.onmessage = (e) => {
      if (!isLeader) return; // non-leader tabs receive the event but ignore it
      try {
        const data: IncomingCallEvent = JSON.parse(e.data);
        if (data.contactId) {
          window.open(`/crm/contacts/${data.contactId}`, "_blank");
        }
      } catch {}
    };

    return () => {
      released = true;
      source.close();
    };
  }, []);

  return null;
}
