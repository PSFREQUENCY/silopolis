"use client";

/**
 * SILOPOLIS — Activity Toast Notifications
 * Polls /api/feed every 20s and surfaces real agent events as pop-ups.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const FETCH_HEADERS: HeadersInit = { "Bypass-Tunnel-Reminder": "true" };

// ── Toast types ───────────────────────────────────────────────────────────────

type ToastType = "skill" | "trade" | "signal" | "guard" | "learn";

interface Toast {
  id: number;
  type: ToastType;
  agent: string;
  title: string;
  detail: string;
  timestamp: number;
}

const TYPE_CONFIG: Record<ToastType, { color: string; glyph: string; bg: string }> = {
  skill:  { color: "#a78bfa", glyph: "◊", bg: "rgba(124,58,237,0.12)" },
  trade:  { color: "#22c55e", glyph: "⬡", bg: "rgba(34,197,94,0.10)"  },
  signal: { color: "#00f0ff", glyph: "◈", bg: "rgba(0,240,255,0.08)"  },
  guard:  { color: "#FBBF24", glyph: "◇", bg: "rgba(251,191,36,0.08)" },
  learn:  { color: "#ec4899", glyph: "⬢", bg: "rgba(236,72,153,0.08)" },
};

// Map API action tags → toast types
function actionToType(action: string, agentType: string): ToastType {
  const a = action.toUpperCase();
  if (a === "SWAP" || a === "LP" || a === "QUEUED") return "trade";
  if (a === "GUARDING" || a === "PATROLLING" || a === "MONITORING") return "guard";
  if (a === "DEPLOYING" || a === "ARCHIVING") return "skill";
  if (a === "FORECASTING" || a === "RESEARCHING") return "learn";
  // SCANNING, ANALYZING, HUNTING, ERR, STANDBY → signal
  return "signal";
}

// Human-readable title from action tag + agent name
function actionTitle(action: string, agent: string): string {
  const titles: Record<string, string> = {
    SWAP:        "Trade executed on-chain",
    LP:          "LP position updated",
    QUEUED:      "Trade queued for execution",
    SCANNING:    "Market signal detected",
    ANALYZING:   "Pattern analysis complete",
    HUNTING:     "Target gem identified",
    FORECASTING: "Price forecast issued",
    RESEARCHING: "Knowledge entry acquired",
    ARCHIVING:   "Decision archived to vault",
    DEPLOYING:   "Skill deployed to swarm",
    MONITORING:  "Threat monitoring active",
    PATROLLING:  "Security patrol in progress",
    GUARDING:    "Risk threshold engaged",
    ERR:         "Cycle exception caught",
  };
  return titles[action] ?? `${agent} active`;
}

interface FeedItem {
  ts: string;
  agent: string;
  action: string;
  outcome: string;
  confidence: number;
  reasoning: string;
  okb_price: number;
  tx_hash: string | null;
  tx_link: string | null;
}

let toastIdCounter = 0;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ActivityToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastTsRef = useRef<string>("");
  const seenIds = useRef<Set<string>>(new Set());

  const pushToast = useCallback((item: FeedItem) => {
    const type = actionToType(item.action, item.agent);
    const id = ++toastIdCounter;
    const shortAgent = item.agent.replace("SILO-", "");
    const detail = item.reasoning
      ? `${item.reasoning.slice(0, 90)}${item.reasoning.length > 90 ? "…" : ""}`
      : `${item.action} · confidence ${item.confidence}%${item.tx_hash ? ` · ${item.tx_hash.slice(0, 10)}…` : ""}`;

    setToasts(prev => [...prev.slice(-3), {
      id,
      type,
      agent: shortAgent,
      title: actionTitle(item.action, shortAgent),
      detail,
      timestamp: Date.now(),
    }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6200);
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/feed?limit=5`, { headers: FETCH_HEADERS });
      if (!r.ok) return;
      const data = await r.json();
      const items: FeedItem[] = data.feed ?? [];
      if (!items.length) return;

      // Only show items newer than our last seen timestamp
      const fresh = items.filter(item => {
        const key = `${item.agent}:${item.ts}`;
        if (seenIds.current.has(key)) return false;
        if (lastTsRef.current && item.ts <= lastTsRef.current) return false;
        return true;
      });

      if (fresh.length > 0) {
        lastTsRef.current = fresh[0].ts; // newest first
        // Show at most 1 toast per poll to avoid flooding
        const item = fresh[0];
        const key = `${item.agent}:${item.ts}`;
        seenIds.current.add(key);
        // Only surface interesting actions (skip boring idle states on first render)
        const boring = ["ANALYZING", "SCANNING", "MONITORING", "PATROLLING"];
        if (!boring.includes(item.action) || seenIds.current.size <= 3) {
          pushToast(item);
        }
      } else if (seenIds.current.size === 0 && items.length > 0) {
        // First load — show the most recent event
        const item = items[0];
        const key = `${item.agent}:${item.ts}`;
        seenIds.current.add(key);
        lastTsRef.current = item.ts;
        pushToast(item);
      }
    } catch {
      // API offline — stay silent
    }
  }, [pushToast]);

  useEffect(() => {
    // First toast after 3s so page loads first
    const first = setTimeout(poll, 3000);
    // Then poll every 20s
    const iv = setInterval(poll, 20_000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [poll]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 56,
      right: 16,
      zIndex: 8000,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      pointerEvents: "none",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {toasts.map(toast => {
        const cfg = TYPE_CONFIG[toast.type];
        const age = (Date.now() - toast.timestamp) / 1000;
        const isNew = age < 0.5;

        return (
          <div
            key={toast.id}
            style={{
              width: 310,
              background: "rgba(5,4,2,0.95)",
              border: `1px solid ${cfg.color}35`,
              backdropFilter: "blur(16px)",
              padding: "10px 12px",
              boxShadow: `0 0 20px ${cfg.color}18, 0 4px 24px rgba(0,0,0,0.6)`,
              transform: isNew ? "translateX(8px)" : "translateX(0)",
              opacity: isNew ? 0.8 : 1,
              transition: "transform 0.4s ease, opacity 0.4s ease",
            }}
          >
            {/* Top row: glyph + type + agent */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: "0.8rem", color: cfg.color, textShadow: `0 0 10px ${cfg.color}80` }}>
                {cfg.glyph}
              </span>
              <span style={{
                fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.2em",
                color: cfg.color, textTransform: "uppercase" as const,
                background: cfg.bg, border: `1px solid ${cfg.color}25`, padding: "1px 7px",
              }}>
                {toast.type}
              </span>
              <span style={{ fontSize: "0.6rem", color: "#4A3A22", marginLeft: "auto" }}>
                {toast.agent}
              </span>
            </div>

            {/* Title */}
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#C8A850", marginBottom: 3, lineHeight: 1.3 }}>
              {toast.title}
            </div>

            {/* Detail */}
            <div style={{ fontSize: "0.62rem", color: "#4A3A22", lineHeight: 1.45 }}>
              {toast.detail}
            </div>

            {/* Drain timer */}
            <div style={{ marginTop: 8, height: 2, background: "#1A1208", borderRadius: 1, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: cfg.color, opacity: 0.5,
                animation: "toast-drain 6.2s linear forwards",
                transformOrigin: "left",
              }} />
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes toast-drain {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
