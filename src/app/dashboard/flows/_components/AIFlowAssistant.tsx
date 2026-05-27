"use client";

import React, { useState, useRef } from "react";
import { Sparkles, Send, Loader2, Check, RefreshCw, ChevronRight } from "lucide-react";
import { useFlowStore } from "../store";
import { type AppNode } from "../store";
import { type Edge } from "@xyflow/react";

const EXAMPLE_PROMPTS = [
  "Restaurant reservation flow",
  "Lead capture for real estate",
  "Customer support with FAQ",
  "Clinic appointment booking",
  "FAQ bot with AI fallback",
];

type Status = "idle" | "loading" | "done" | "error";

export default function AIFlowAssistant() {
  const [prompt, setPrompt]   = useState("");
  const [status, setStatus]   = useState<Status>("idle");
  const [genName, setGenName] = useState("");
  const [errMsg, setErrMsg]   = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { loadTemplate } = useFlowStore();

  const generate = async (text: string) => {
    const p = text.trim();
    if (!p) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const res  = await fetch("/api/dashboard/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Generation failed");
      loadTemplate(json.data.nodes as AppNode[], json.data.edges as Edge[]);
      setGenName(json.data.name);
      setStatus("done");
    } catch (e) {
      setErrMsg((e as Error).message);
      setStatus("error");
    }
  };

  const reset = () => { setStatus("idle"); setPrompt(""); setGenName(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px 14px", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Sparkles size={13} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>AI Flow Generator</div>
          <div style={{ fontSize: 10, color: "#475569" }}>Describe your flow in plain English</div>
        </div>
      </div>

      {/* Done state */}
      {status === "done" && (
        <div style={{
          background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Check size={14} color="#10b981" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#34d399" }}>Flow generated!</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}><strong style={{ color: "#94a3b8" }}>{genName}</strong> is now loaded on the canvas. Customise it from the inspector.</div>
          <button onClick={reset} style={{
            marginTop: 2, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7, padding: "5px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
          }}>
            <RefreshCw size={11} /> Generate another
          </button>
        </div>
      )}

      {/* Prompt area */}
      {status !== "done" && (
        <>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(prompt); } }}
              placeholder="e.g. Create a restaurant reservation flow with guest count, date, and confirmation…"
              rows={4}
              style={{
                width: "100%", resize: "none", background: "transparent",
                border: "none", outline: "none", padding: "12px 12px 4px",
                fontSize: 12, color: "#e2e8f0", fontFamily: "inherit",
                lineHeight: 1.55,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 10px 8px" }}>
              <button
                onClick={() => generate(prompt)}
                disabled={status === "loading" || !prompt.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                  cursor: status === "loading" || !prompt.trim() ? "not-allowed" : "pointer",
                  background: status === "loading" || !prompt.trim()
                    ? "rgba(99,102,241,0.2)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none", color: "#fff",
                  opacity: !prompt.trim() ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {status === "loading" ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                {status === "loading" ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>

          {status === "error" && (
            <div style={{ fontSize: 11, color: "#f87171", background: "rgba(239,68,68,0.08)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(239,68,68,0.15)" }}>
              {errMsg}
            </div>
          )}

          {/* Example prompts */}
          <div>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, fontWeight: 600 }}>
              Quick examples
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {EXAMPLE_PROMPTS.map(ex => (
                <button key={ex} onClick={() => { setPrompt(ex); inputRef.current?.focus(); }}
                  style={{
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8, padding: "7px 10px", fontSize: 11, color: "#64748b",
                    cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.08)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
                >
                  {ex}
                  <ChevronRight size={11} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
