import { getSectionType, checkGenerationInput } from "@proposal/shared";
import { generateSection } from "../../../../src/server/generateSection";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";
import { getActiveModel } from "../../../../src/server/aiModel";
import { checkRateLimit } from "../../../../src/server/rateLimit";

/**
 * POST /api/generate/proposal — stream a full draft (§10.1, §13.6). Generates
 * text-category sections one at a time and emits one SSE `section` event per
 * finished section, so copy appears progressively. Data sections are the user's
 * to fill (grid/import), so they're skipped here.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const limit = checkRateLimit(owner);
  if (!limit.ok) {
    return new Response(
      JSON.stringify({ error: "Too many generation requests. Please wait a moment." }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { brief?: unknown }).brief !== "string" ||
    !Array.isArray((body as { types?: unknown }).types)
  ) {
    return new Response(JSON.stringify({ error: "Expected { brief, types[] }" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { brief, types } = body as { brief: string; types: string[] };

  const limitError = checkGenerationInput({ brief });
  if (limitError)
    return new Response(JSON.stringify({ error: limitError }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  const textTypes = types.filter((t) => getSectionType(t)?.category === "text");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));

      const model = await getActiveModel();
      for (let i = 0; i < textTypes.length; i++) {
        const type = textTypes[i]!;
        const result = await generateSection(
          { type, brief, model, sectionId: `gen_${i}` },
          anthropicCreateMessage,
        );
        if (result.ok) send("section", { type, data: result.data, validation: result.validation });
        else send("error", { type, error: result.error });
      }
      send("done", { count: textTypes.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
