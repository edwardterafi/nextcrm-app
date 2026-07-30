import { NextRequest } from "next/server";
import { callEventEmitter, IncomingCallEvent } from "@/lib/call-events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let onEvent: (event: IncomingCallEvent) => void;

  const stream = new ReadableStream({
    start(controller) {
      onEvent = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      callEventEmitter.on("incoming-call", onEvent);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 20000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        callEventEmitter.off("incoming-call", onEvent);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
