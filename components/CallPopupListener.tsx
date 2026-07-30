"use client";
import { useEffect } from "react";

type IncomingCallEvent = {
  callId: string;
  callerNumber: string;
  contactId: string | null;
};

const HANDLED_CALL_TTL_MS = 60_000; // stale claim cleanup window

function tryClaimCall(callId: string): boolean {
  const key = `call-popup-handled:${callId}`;
  if (localStorage.getItem(key)) return false; // another tab already claimed it
  localStorage.setItem(key, String(Date.now()));
  return true;
}

function cleanupStaleClaims() {
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith("call-popup-handled:")) continue;
    const ts = Number(localStorage.getItem(key));
    if (!ts || now - ts > HANDLED_CALL_TTL_MS) {
      localStorage.removeItem(key);
    }
  }
}

export function CallPopupListener() {
  useEffect(() => {
    let isLeader = false;

    // Primary defense: only the elected leader tab acts on events at all.
    navigator.locks.request("call-popup-leader", { mode: "exclusive" }, () => {
      isLeader = true;
      return new Promise<void>(() => {});
    });

    const source = new EventSource("/api/yeastar/events");
    source.onmessage = (e) => {
      if (!isLeader) return;
      try {
        const data: IncomingCallEvent = JSON.parse(e.data);
        if (!data.contactId) return;

        cleanupStaleClaims();

        // Secondary defense: even if two tabs briefly both believe
        // they're leader during a handoff (e.g. right after the old
        // leader tab closes), only the first one to claim this exact
        // callId is allowed to actually open the popup.
        if (!tryClaimCall(data.callId)) return;

        window.open(`/crm/contacts/${data.contactId}`, "_blank");
      } catch {}
    };

    return () => source.close();
  }, []);

  return null;
}
