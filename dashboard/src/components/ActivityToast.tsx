"use client";

/**
 * SILOPOLIS — Activity Toast Notifications
 * Pop-up event notifications from the agent swarm.
 * Examples: oracle learned a skill, hunter found a winning trade, etc.
 */

import { useState, useEffect, useCallback } from "react";

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

const TYPE_CONFIG: Record<ToastType, { color: string; rgb: string; glyph: string; bg: string }> = {
  skill:  { color: "#a78bfa", rgb: "167,139,250", glyph: "◊", bg: "rgba(124,58,237,0.12)" },
  trade:  { color: "#22c55e", rgb: "34,197,94",   glyph: "⬡", bg: "rgba(34,197,94,0.10)"  },
  signal: { color: "#00f0ff", rgb: "0,240,255",   glyph: "◈", bg: "rgba(0,240,255,0.08)"  },
  guard:  { color: "#FBBF24", rgb: "251,191,36",  glyph: "◇", bg: "rgba(251,191,36,0.08)" },
  learn:  { color: "#ec4899", rgb: "236,72,153",  glyph: "⬢", bg: "rgba(236,72,153,0.08)" },
};

// ── Notification bank ─────────────────────────────────────────────────────────

const NOTIFICATIONS: { type: ToastType; agent: string; title: string; detail: string }[] = [
  { type: "skill",  agent: "ORACLE-02",   title: "New relic acquired",          detail: "Cipher Token (x402 payments) · LEGENDARY · skill #6 unlocked" },
  { type: "trade",  agent: "HUNTER-03",   title: "Winning trade detected",       detail: "SWRMX +641% in 18 days · stop-loss exit executed · profit routed" },
  { type: "signal", agent: "SCOUT-01",    title: "Narrative spike detected",     detail: "AI Agent tokens +340% mentions · Base chain · 12 new gems in queue" },
  { type: "learn",  agent: "LEARNER",     title: "Pattern learned from trade",   detail: "Base + AI narrative + sub-$500K → 72% win rate · weights updated" },
  { type: "guard",  agent: "ARBITER-04",  title: "Threat blocked",               detail: "Honeypot detected on XXXXXXX · contract flagged · buy order cancelled" },
  { type: "skill",  agent: "CIPHER-01",   title: "Mastery tier unlocked",        detail: "CIPHER tier reached · composite score 720 · 6 relics in vault" },
  { type: "trade",  agent: "HUNTER-03",   title: "Trade executed on-chain",      detail: "NEURAL $0.0015 · 800 USDC position · conviction 87/100 · Base chain" },
  { type: "signal", agent: "ORACLE-02",   title: "Whale wallet movement",        detail: "0x3f2B loaded $120K NEURAL · ETH chain · DeFi OG classification" },
  { type: "learn",  agent: "LEARNER",     title: "Win rate improved",            detail: "Consecutive wins: 5 · win rate updated 68% → 72.3% · cycle #47" },
  { type: "guard",  agent: "ARBITER-04",  title: "Risk limit approaching",       detail: "Daily budget 78% spent · entering guard mode · new entries paused" },
  { type: "skill",  agent: "SCRIBE-05",   title: "Knowledge entry archived",     detail: "Pattern: Google Trends 48h lag → 10x potential · confidence 78%" },
  { type: "trade",  agent: "HUNTER-03",   title: "Take-profit triggered",        detail: "INTNT +302% · sold 40% at 10x · profit routed to cold wallet" },
  { type: "signal", agent: "SCOUT-01",    title: "New token discovered",         detail: "CORTX on SOL · mcap $180K · liq $48K · conviction building: 76/100" },
  { type: "learn",  agent: "LEARNER",     title: "Oracle skill mastered",        detail: "8-axis score update · cognition +22 · collaboration +15 · rank #1" },
  { type: "skill",  agent: "ORACLE-02",   title: "Relic upgraded",               detail: "Oracle Lens → advanced tier · market signal resolution +45% accuracy" },
];

let toastIdCounter = 0;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ActivityToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifIdx, setNotifIdx] = useState(0);

  const addToast = useCallback((notif: typeof NOTIFICATIONS[0]) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev.slice(-3), { ...notif, id, timestamp: Date.now() }]);
    // Auto-dismiss after 6s
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6200);
  }, []);

  // Auto-generate notifications every 18–40 seconds
  useEffect(() => {
    const fire = () => {
      const notif = NOTIFICATIONS[notifIdx % NOTIFICATIONS.length];
      setNotifIdx(i => i + 1);
      addToast(notif);
    };

    // First toast after 4s
    const first = setTimeout(fire, 4000);
    // Then on interval
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 18000 + Math.random() * 22000;
      timeout = setTimeout(() => { fire(); schedule(); }, delay);
    };
    schedule();

    return () => { clearTimeout(first); clearTimeout(timeout); };
  }, [addToast, notifIdx]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 56, // above the 40px ticker
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
              <span style={{
                fontSize: "0.8rem", color: cfg.color,
                textShadow: `0 0 10px ${cfg.color}80`,
              }}>
                {cfg.glyph}
              </span>
              <span style={{
                fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.2em",
                color: cfg.color, textTransform: "uppercase" as const,
                background: cfg.bg,
                border: `1px solid ${cfg.color}25`,
                padding: "1px 7px",
              }}>
                {toast.type}
              </span>
              <span style={{ fontSize: "0.6rem", color: "#4A3A22", marginLeft: "auto" }}>
                {toast.agent}
              </span>
            </div>

            {/* Title */}
            <div style={{
              fontSize: "0.72rem", fontWeight: 700,
              color: "#C8A850", marginBottom: 3, lineHeight: 1.3,
            }}>
              {toast.title}
            </div>

            {/* Detail */}
            <div style={{
              fontSize: "0.62rem", color: "#4A3A22", lineHeight: 1.45,
            }}>
              {toast.detail}
            </div>

            {/* Progress bar (6s timer) */}
            <div style={{
              marginTop: 8, height: 2, background: "#1A1208", borderRadius: 1, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                background: cfg.color,
                opacity: 0.5,
                animation: `toast-drain 6.2s linear forwards`,
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
