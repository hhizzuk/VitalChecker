"use client";

import { useState, useRef } from "react";
import { ScoredCompany, InvestigationEvent, FeedMessage } from "@/lib/types";

export default function Home() {
  const [thesis, setThesis] = useState("");
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [feedMessages, setFeedMessages] = useState<FeedMessage[]>([]);
  const [results, setResults] = useState<ScoredCompany[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  function addFeedMessage(msg: FeedMessage) {
    setFeedMessages((prev) => [...prev, msg]);
    setTimeout(() => {
      feedRef.current?.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!thesis.trim() || isInvestigating) return;

    setIsInvestigating(true);
    setFeedMessages([]);
    setResults([]);

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data: InvestigationEvent = JSON.parse(line.slice(6));

          switch (data.type) {
            case "thinking":
              addFeedMessage({
                type: "thinking",
                text: data.message || "",
                iteration: data.iteration,
              });
              break;
            case "tool_call":
              addFeedMessage({
                type: "tool_call",
                text: `${data.toolName}(${formatArgs(data.toolArgs)})`,
                iteration: data.iteration,
              });
              break;
            case "tool_result":
              addFeedMessage({
                type: "tool_result",
                text: data.message || "",
                iteration: data.iteration,
              });
              break;
            case "status":
              addFeedMessage({
                type: "status",
                text: data.message || "",
              });
              break;
            case "result":
              if (data.company) {
                setResults((prev) =>
                  [...prev, data.company!].sort((a, b) => b.score - a.score)
                );
              }
              break;
            case "done":
              addFeedMessage({ type: "status", text: data.message || "Done." });
              setIsInvestigating(false);
              break;
            case "error":
              addFeedMessage({
                type: "error",
                text: data.message || "Unknown error",
              });
              setIsInvestigating(false);
              break;
          }
        }
      }
    } catch {
      addFeedMessage({ type: "error", text: "Connection failed" });
      setIsInvestigating(false);
    }
  }

  const demoTheses = [
    "AI infra companies hiring senior MLEs",
    "B2B SaaS that just raised Series A",
    "Developer tools with explosive GitHub growth",
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-10">
        <h1 className="text-5xl font-bold tracking-tight mb-2">Tipoff</h1>
        <p className="text-zinc-400 text-lg mb-12">
          Get the tip before everyone else.
        </p>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="relative">
            <input
              type="text"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="What kind of company are you looking for?"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-5 py-4 text-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              disabled={isInvestigating}
            />
            <button
              type="submit"
              disabled={isInvestigating || !thesis.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white text-black px-5 py-2 rounded-md font-medium text-sm hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              {isInvestigating ? "Investigating..." : "Investigate"}
            </button>
          </div>
        </form>

        {/* Demo theses */}
        {!isInvestigating && results.length === 0 && feedMessages.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-12">
            {demoTheses.map((demo) => (
              <button
                key={demo}
                onClick={() => setThesis(demo)}
                className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1.5 rounded-full hover:border-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {demo}
              </button>
            ))}
          </div>
        )}

        {/* Activity Feed */}
        {feedMessages.length > 0 && (
          <div
            ref={feedRef}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 mb-10 max-h-96 overflow-y-auto font-mono text-sm leading-relaxed"
          >
            {feedMessages.map((msg, i) => (
              <FeedLine key={i} msg={msg} prevMsg={i > 0 ? feedMessages[i - 1] : undefined} />
            ))}
            {isInvestigating && (
              <div className="py-1 text-zinc-500 animate-pulse">
                <span className="text-zinc-600 mr-2">&#9679;</span>
                Agent working...
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-zinc-300 mb-4">
              Results ({results.length})
            </h2>
            {results.map((company, i) => (
              <div
                key={`${company.name}-${i}`}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 animate-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {company.name}
                    </h3>
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {company.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="text-2xl font-bold text-white">
                      {company.score}
                    </span>
                    <span className="text-xs text-zinc-500">/100</span>
                  </div>
                </div>

                {/* Score bar */}
                <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${company.score}%`,
                      backgroundColor:
                        company.score >= 80
                          ? "#22c55e"
                          : company.score >= 60
                          ? "#eab308"
                          : "#ef4444",
                    }}
                  />
                </div>

                {/* Reasoning */}
                <p className="text-sm text-zinc-300 mb-3">
                  {company.reasoning}
                </p>

                {/* Source badges & links */}
                <div className="flex items-center gap-2 flex-wrap">
                  {company.sources.map((src) => (
                    <span
                      key={src}
                      className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded"
                    >
                      {src}
                    </span>
                  ))}
                  {company.url && (
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
                    >
                      Visit &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function FeedLine({
  msg,
  prevMsg,
}: {
  msg: FeedMessage;
  prevMsg?: FeedMessage;
}) {
  const showDivider =
    msg.iteration &&
    prevMsg?.iteration &&
    msg.iteration !== prevMsg.iteration &&
    msg.type === "thinking";

  return (
    <>
      {showDivider && (
        <div className="border-t border-zinc-800 my-2" />
      )}
      <div
        className={`py-1 animate-fade-in ${getMessageStyle(msg.type)}`}
      >
        <span className="mr-2">{getMessageIcon(msg.type)}</span>
        {msg.type === "thinking" ? (
          <span className="italic">{msg.text}</span>
        ) : msg.type === "tool_call" ? (
          <span>
            <span className="font-bold">Calling </span>
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-blue-300">
              {msg.text}
            </code>
          </span>
        ) : msg.type === "tool_result" ? (
          <span className="ml-4 block whitespace-pre-wrap">{truncateResult(msg.text)}</span>
        ) : (
          <span>{msg.text}</span>
        )}
      </div>
    </>
  );
}

function getMessageStyle(type: string): string {
  switch (type) {
    case "thinking":
      return "text-zinc-400";
    case "tool_call":
      return "text-blue-400";
    case "tool_result":
      return "text-green-400 text-xs";
    case "error":
      return "text-red-400";
    default:
      return "text-emerald-400";
  }
}

function getMessageIcon(type: string): string {
  switch (type) {
    case "thinking":
      return "\u{1F9E0}";
    case "tool_call":
      return "\u{1F50D}";
    case "tool_result":
      return "\u2514";
    case "error":
      return "\u2716";
    default:
      return "\u25B8";
  }
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  return Object.entries(args)
    .map(([k, v]) => `${k}: "${v}"`)
    .join(", ");
}

function truncateResult(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= 8) return text;
  return lines.slice(0, 8).join("\n") + `\n... and ${lines.length - 8} more`;
}
