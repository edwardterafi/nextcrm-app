import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __callEventEmitter: EventEmitter | undefined;
}

export const callEventEmitter = global.__callEventEmitter ?? new EventEmitter();

if (!global.__callEventEmitter) {
  callEventEmitter.setMaxListeners(50);
  global.__callEventEmitter = callEventEmitter;
}

export type IncomingCallEvent = {
  callId: string;
  callerNumber: string;
  contactId: string | null;
};
