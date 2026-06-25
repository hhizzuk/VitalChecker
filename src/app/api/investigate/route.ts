import { NextRequest } from "next/server";
import { isApifyConfigured } from "@/lib/apify";
import { runAgentLoop } from "@/lib/claude";
import { parseThesis } from "@/lib/thesis";
import { InvestigationEvent } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { thesis } = await req.json();

  if (!thesis || typeof thesis !== "string") {
    return new Response(JSON.stringify({ error: "Thesis is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: InvestigationEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // Step 1: Parse thesis
        send({ type: "status", message: "Parsing your investment thesis..." });
        const criteria = await parseThesis(thesis);
        send({
          type: "status",
          message: `Focus: ${criteria.industry} | Stage: ${criteria.stage} | Signals: ${criteria.signals.join(", ")}`,
        });

        // Step 2: Run agent loop — all thinking, tool calls, and results stream via send()
        send({ type: "status", message: "Agent starting investigation..." });
        send({
          type: "status",
          message: isApifyConfigured()
            ? "Apify Store: connected (search_news, search_crunchbase, scrape_website use your API token)."
            : "Apify Store: not configured — add APIFY_API_TOKEN to tipoff/.env.local and restart the dev server.",
        });
        const results = await runAgentLoop(thesis, criteria, send);

        // Step 3: Emit final results
        for (const company of results) {
          send({ type: "result", company });
        }

        send({
          type: "done",
          message: `Investigation complete. Found ${results.length} matching companies.`,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Investigation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
