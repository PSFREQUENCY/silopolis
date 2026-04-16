"use client";

/**
 * SILOPOLIS — Ancient Cyberspy Relic Hunter Interface
 * Where human ambition and machine precision forge something the world has never seen.
 * Theme: Classified archaeological vault meets autonomous intelligence network.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { TxHistoryItem } from "../components/NeuronArena";

const HeartbeatTimer = dynamic(() => import("../components/HeartbeatTimer"), { ssr: false });
const ParticleArena  = dynamic(() => import("../components/ParticleArena"),  { ssr: false });
const NeuronArena    = dynamic(() => import("../components/NeuronArena"),    { ssr: false });
const PriceTicker    = dynamic(() => import("../components/PriceTicker"),    { ssr: false });
const ActivityToast  = dynamic(() => import("../components/ActivityToast"),  { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const FETCH_HEADERS: HeadersInit = { "Bypass-Tunnel-Reminder": "true" };

// Agent color map (mirrors NeuronArena AGENT_PATH)
const AGENT_COLORS: Record<string, string> = {
  "SILO-TRADER-1":    "#22c55e",
  "SILO-ANALYST-2":   "#22d3ee",
  "SILO-SKILL-3":     "#7c3aed",
  "SILO-GUARD-4":     "#FBBF24",
  "SILO-SCRIBE-5":    "#ec4899",
  "SILO-HUNTER-6":    "#00f0ff",
  "SILO-ORACLE-7":    "#38BDF8",
  "SILO-SUSTAINER-8": "#a78bfa",
  "SILO-SENTRY-9":    "#FB923C",
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Dimensions {
  accuracy: number; quality: number; execution: number; structure: number;
  safety: number; security: number; cognition: number; collaboration: number;
  composite: number;
}
interface Agent {
  rank: number; name: string; type: string; composite: number;
  dimensions: Dimensions; skills: number; tx_count: number;
}
interface SwarmStatus {
  running: boolean; cycle_count: number; agent_count: number;
  global_budget_remaining_usd: number;
}

// ─── Mastery / Vault Tier System ─────────────────────────────────────────────

const VAULT_TIERS = [
  { min: 900, tier: "ORACLE",    roman: "I",    color: "#FFD700", glow: "#FFD70040", ring: "border-yellow-300/60",  bg: "bg-yellow-950/30"  },
  { min: 750, tier: "CIPHER",    roman: "II",   color: "#C084FC", glow: "#C084FC40", ring: "border-purple-400/60",  bg: "bg-purple-950/30"  },
  { min: 600, tier: "EXCAVATOR", roman: "III",  color: "#34D399", glow: "#34D39940", ring: "border-emerald-400/60", bg: "bg-emerald-950/30" },
  { min: 450, tier: "SCOUT",     roman: "IV",   color: "#60A5FA", glow: "#60A5FA40", ring: "border-blue-400/60",    bg: "bg-blue-950/30"    },
  { min: 300, tier: "INITIATE",  roman: "V",    color: "#FB923C", glow: "#FB923C40", ring: "border-orange-400/60",  bg: "bg-orange-950/30"  },
  { min: 0,   tier: "RELIC",     roman: "VI",   color: "#6B7280", glow: "#6B728040", ring: "border-gray-600/60",    bg: "bg-gray-950/30"    },
];

function getVaultTier(composite: number) {
  return VAULT_TIERS.find(t => composite >= t.min) ?? VAULT_TIERS[VAULT_TIERS.length - 1];
}

const DIM_LABELS: Record<string, string> = {
  accuracy: "Accuracy", quality: "Quality", execution: "Execution",
  structure: "Structure", safety: "Safety", security: "Security",
  cognition: "Cognition", collaboration: "Collab",
};

const DIM_COLORS: Record<string, string> = {
  accuracy:      "#34D399", quality:       "#60A5FA",
  execution:     "#FBBF24", structure:     "#818CF8",
  safety:        "#F472B6", security:      "#F87171",
  cognition:     "#C084FC", collaboration: "#FB923C",
};

const SKILL_RELICS = [
  { id: "dex-swap",      name: "Swap Relic",       glyph: "⬡", color: "#34D399", desc: "On-chain DEX arbitrage via OnchainOS",         rarity: "RARE"      },
  { id: "market-scan",   name: "Oracle Lens",       glyph: "◈", color: "#60A5FA", desc: "Real-time market signals + trend decoding",    rarity: "UNCOMMON"  },
  { id: "x402-payments", name: "Cipher Token",      glyph: "⬟", color: "#C084FC", desc: "Agent-to-agent x402 micropayment artifact",   rarity: "LEGENDARY" },
  { id: "lp-strategy",   name: "Liquidity Glyph",   glyph: "◊", color: "#FBBF24", desc: "Uniswap V3 LP position strategy fragment",    rarity: "EPIC"      },
  { id: "reputation",    name: "Vault Sigil",        glyph: "⬢", color: "#F472B6", desc: "8-axis on-chain mastery scoring relic",       rarity: "LEGENDARY" },
  { id: "skill-market",  name: "Exchange Tablet",   glyph: "⬡", color: "#06B6D4", desc: "Buy, sell, rate relics via SkillMarket.sol",  rarity: "RARE"      },
  { id: "swarmfi",       name: "Cognition Core",    glyph: "◈", color: "#A3E635", desc: "Gemini 2.5 threat-gated reasoning engine",    rarity: "EPIC"      },
  { id: "threat-gate",   name: "Arbiter Seal",      glyph: "◇", color: "#FB923C", desc: "Local safety arbiter — blocks score ≥76",     rarity: "UNCOMMON"  },
];

// X Layer confirmed liquid tokens — tested on PotatoSwap/CurveNG
const PORTFOLIO_BASKET = [
  { symbol: "OKB",   pct: 55, color: "#DAA520", desc: "Core — accumulate every cycle" },
  { symbol: "USDT0", pct: 35, color: "#34D399", desc: "Bridged USDT — buyback reserve" },
  { symbol: "USDC",  pct:  8, color: "#818CF8", desc: "Stable secondary" },
  { symbol: "SILO",  pct:  2, color: "#C084FC", desc: "Protocol token — earn via tiers" },
];

const RARITY_COLORS: Record<string, string> = {
  LEGENDARY: "text-yellow-300",
  EPIC:      "text-purple-300",
  RARE:      "text-blue-300",
  UNCOMMON:  "text-green-300",
  COMMON:    "text-gray-400",
};

// ─── Animated Number ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    if (Math.abs(to - from) < 0.001) return;
    let raf: number;
    const t0 = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      setDisplay(from + (to - from) * ease);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

// ─── Glitch text effect ───────────────────────────────────────────────────────

function GlitchText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`} data-text={children}>
      {children}
    </span>
  );
}

// ─── Scan line decoration ────────────────────────────────────────────────────

function ScanLine() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03]"
      style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(180,140,60,0.4) 2px, rgba(180,140,60,0.4) 4px)",
      }}
    />
  );
}

// ─── Cipher border decoration ─────────────────────────────────────────────────

function CipherBorder({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        border: "1px solid #B8860B33",
        boxShadow: "0 0 0 1px #0A0A0A, inset 0 0 60px rgba(180,134,11,0.03)",
        ...style,
      }}
    >
      {/* Corner accents */}
      {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
        <span
          key={i}
          className={`absolute w-3 h-3 ${pos}`}
          style={{
            borderTop:    i < 2 ? "1px solid #B8860B80" : "none",
            borderBottom: i >= 2 ? "1px solid #B8860B80" : "none",
            borderLeft:   i % 2 === 0 ? "1px solid #B8860B80" : "none",
            borderRight:  i % 2 === 1 ? "1px solid #B8860B80" : "none",
          }}
        />
      ))}
      {children}
    </div>
  );
}

// ─── Agent Radar ──────────────────────────────────────────────────────────────

function AgentRadar({ agent }: { agent: Agent }) {
  const tier = getVaultTier(agent.composite);
  const data = Object.entries(DIM_LABELS).map(([key, label]) => ({
    dim: label, score: agent.dimensions[key as keyof Dimensions] as number,
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data}>
        <PolarGrid stroke="#2A1F0A" />
        <PolarAngleAxis dataKey="dim" tick={{ fill: "#6B5C3A", fontSize: 9, fontFamily: "monospace" }} />
        <Radar dataKey="score" stroke={tier.color} fill={tier.color} fillOpacity={0.12} />
        <Tooltip
          contentStyle={{ background: "#0A0806", border: `1px solid ${tier.color}40`, borderRadius: 4, fontSize: 10 }}
          labelStyle={{ color: tier.color }}
          formatter={(v: number) => [v.toFixed(0), ""]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Agent / Relic Hunter Card ────────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  const tier = getVaultTier(agent.composite);
  const pct = (agent.composite / 1000) * 100;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-none transition-all duration-300 group relative overflow-hidden"
      style={{
        background: selected ? "#0F0C08" : "#080604",
        border: selected ? `1px solid ${tier.color}60` : "1px solid #2A1E0A",
        boxShadow: selected ? `0 0 30px ${tier.glow}, inset 0 0 30px ${tier.glow}` : "none",
      }}
    >
      {/* Top accent line */}
      <div className="h-px w-full" style={{ background: selected ? `linear-gradient(90deg, transparent, ${tier.color}, transparent)` : "#1A1208" }} />

      {/* Scan line overlay */}
      <ScanLine />

      <div className="p-5 relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {/* Rank + Name */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs" style={{ color: "#6B5C3A" }}>#{agent.rank.toString().padStart(2, "0")}</span>
              <span className="font-black font-mono text-sm tracking-widest text-white">{agent.name}</span>
            </div>
            {/* Tier badge + type */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="font-bold font-mono text-xs tracking-[0.2em] px-2 py-0.5"
                style={{ color: tier.color, background: tier.glow, border: `1px solid ${tier.color}40` }}
              >
                {tier.tier}
              </span>
              <span className="font-mono text-xs" style={{ color: "#4A3A22" }}>{agent.type}</span>
            </div>
            <div className="flex gap-3 font-mono text-xs" style={{ color: "#4A3A22" }}>
              <span>{agent.skills} relics</span>
              <span>{agent.tx_count} excavations</span>
            </div>
          </div>

          {/* Score */}
          <div className="text-right">
            <div className="font-black font-mono text-3xl leading-none" style={{ color: tier.color }}>
              <AnimatedNumber value={agent.composite} />
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color: "#4A3A22" }}>vault pts</div>
          </div>
        </div>

        {/* Mastery progress bar (ancient style) */}
        <div className="mb-4">
          <div className="h-1.5 w-full rounded-none" style={{ background: "#1A1208" }}>
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
                boxShadow: `0 0 8px ${tier.color}60`,
              }}
            />
          </div>
          <div className="flex justify-between font-mono text-xs mt-0.5" style={{ color: "#3A2C16" }}>
            <span>NOVICE</span><span>MASTER</span><span>ORACLE</span>
          </div>
        </div>

        {/* Dimension bars */}
        <div className="space-y-1.5">
          {Object.entries(DIM_LABELS).map(([key, label]) => {
            const val = agent.dimensions[key as keyof Dimensions] as number;
            const dimColor = DIM_COLORS[key];
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="font-mono text-xs w-14 flex-shrink-0" style={{ color: "#4A3A22" }}>{label}</span>
                <div className="flex-1 h-1 rounded-none" style={{ background: "#1A1208" }}>
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${(val / 1000) * 100}%`, background: dimColor, boxShadow: `0 0 4px ${dimColor}60` }}
                  />
                </div>
                <span className="font-mono text-xs w-8 text-right" style={{ color: dimColor }}>
                  {val.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Expanded radar */}
        {selected && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid #2A1E0A" }}>
            <AgentRadar agent={agent} />
          </div>
        )}
      </div>

      {/* Bottom accent */}
      <div className="h-px w-full" style={{ background: selected ? `linear-gradient(90deg, transparent, ${tier.color}40, transparent)` : "#1A1208" }} />
    </div>
  );
}

// ─── Risk Panel ───────────────────────────────────────────────────────────────

interface RiskStatus {
  tier: string; description: string; okb_balance: number;
  max_trade_okb: number; daily_budget_okb: number; daily_spent_okb: number;
  total_trades: number; winning_trades: number; win_rate_pct: number; total_profit_okb: number;
  consecutive_losses: number; daily_budget_remaining_okb: number; can_trade: boolean;
  is_paused: boolean; allow_lp: boolean;
}

const TIER_COLORS: Record<string, string> = {
  SEED: "#6B7280", MICRO: "#60A5FA", SMALL: "#34D399",
  MEDIUM: "#FBBF24", ACTIVE: "#DAA520",
};

const OKB_FLOOR = 0.00222;
const OKB_BUFFER = OKB_FLOOR * 3; // 0.00666

function RiskPanel({ apiBase, liveOkbBalance }: { apiBase: string; liveOkbBalance?: number }) {
  const [risk, setRisk] = useState<RiskStatus | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [totalActions, setTotalActions] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const opts = { headers: FETCH_HEADERS };
        const [rr, kr, hr] = await Promise.all([
          fetch(`${apiBase}/api/risk`, opts),
          fetch(`${apiBase}/api/knowledge?limit=100`, opts),
          fetch(`${apiBase}/api/heartbeat/status`, opts),
        ]);
        if (rr.ok) setRisk(await rr.json());
        if (kr.ok) { const kd = await kr.json(); setKnowledgeCount((kd.knowledge ?? []).length); }
        if (hr.ok) { const hd = await hr.json(); setCycleCount(hd.total_cycles ?? 0); setTotalActions(hd.last_heartbeat?.actions_taken ?? 0); }
      } catch {}
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [apiBase]);

  if (!risk) return null;
  const tc = TIER_COLORS[risk.tier] ?? "#6B7280";
  const dailyPct = risk.daily_budget_okb > 0
    ? Math.min(100, (risk.daily_spent_okb / risk.daily_budget_okb) * 100) : 0;

  // OKB floor health — prefer live on-chain balance over stale vault snapshot
  const displayOkb = liveOkbBalance ?? risk.okb_balance;
  const floorPct = Math.min(100, (displayOkb / OKB_BUFFER) * 100);
  const floorColor = displayOkb < OKB_FLOOR ? "#F87171" : displayOkb < OKB_BUFFER ? "#FBBF24" : "#34D399";

  // Portfolio management feed bars (0–100 derived scores)
  const logicScore   = Math.max(0, Math.min(100, 80 - risk.consecutive_losses * 25 + (risk.win_rate_pct > 50 ? 20 : 0)));
  const knowledgeScore = Math.min(100, (knowledgeCount / 40) * 100);
  const implScore    = risk.total_trades > 0 ? Math.min(100, ((risk.winning_trades ?? 0) / risk.total_trades) * 100 + 10) : 10;
  const improvScore  = Math.min(100, risk.win_rate_pct + (cycleCount * 2));

  const basket = PORTFOLIO_BASKET;

  return (
    <div className="p-5 relative overflow-hidden" style={{ background: "#080604", border: "1px solid #2A1E0A" }}>
      <ScanLine />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs tracking-[0.2em] mb-1" style={{ color: "#4A3A22" }}>VAULT RISK PROFILE</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black font-mono tracking-widest" style={{ color: tc }}>{risk.tier}</span>
              {risk.is_paused && <span className="text-xs font-mono animate-pulse" style={{ color: "#F87171" }}>PAUSED</span>}
              {risk.can_trade && !risk.is_paused && <span className="text-xs font-mono" style={{ color: "#34D399" }}>● LIVE</span>}
              {!risk.can_trade && !risk.is_paused && <span className="text-xs font-mono" style={{ color: "#FBBF24" }}>● GUARD</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black font-mono" style={{ color: tc }}>
              {displayOkb.toFixed(6)}
            </div>
            <div className="text-xs font-mono" style={{ color: "#4A3A22" }}>OKB VAULT</div>
          </div>
        </div>
        {/* Tier activation badge */}
        <div className="mb-4">
          {risk.tier === "MICRO" ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-bold tracking-widest animate-pulse"
              style={{
                background: "rgba(218,165,32,0.12)",
                border: "1px solid rgba(218,165,32,0.45)",
                color: "#DAA520",
                boxShadow: "0 0 12px rgba(218,165,32,0.35), 0 0 4px rgba(218,165,32,0.2)",
              }}
            >
              <span style={{ fontSize: "0.7rem" }}>◈</span>
              MICRO TIER ACTIVATED
            </div>
          ) : risk.tier === "SEED" ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-bold tracking-widest"
              style={{ background: "rgba(107,114,128,0.12)", border: "1px solid rgba(107,114,128,0.3)", color: "#6B7280" }}>
              ◇ SEED — BUILDING KNOWLEDGE
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-bold tracking-widest animate-pulse"
              style={{ background: `rgba(52,211,153,0.1)`, border: `1px solid rgba(52,211,153,0.4)`, color: tc,
                       boxShadow: `0 0 10px rgba(52,211,153,0.2)` }}>
              <span style={{ fontSize: "0.7rem" }}>◈</span>
              {risk.tier} TIER ACTIVATED
            </div>
          )}
        </div>

        {/* OKB Floor threshold indicator */}
        <div className="mb-2">
          <div className="flex justify-between text-xs font-mono mb-1">
            <span style={{ color: floorColor }}>OKB FLOOR GUARD</span>
            <span style={{ color: floorColor }}>
              {displayOkb.toFixed(6)} / {OKB_BUFFER.toFixed(6)} OKB
              {displayOkb < OKB_FLOOR ? " ⚠ BELOW FLOOR" : displayOkb < OKB_BUFFER ? " ↑ BUYING" : " ✓ SAFE"}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "#1A1208" }}>
            <div className="h-full transition-all rounded-full" style={{ width: `${floorPct}%`, background: floorColor }} />
          </div>
          <div className="flex justify-between text-xs font-mono mt-0.5" style={{ color: "#2A1E0A" }}>
            <span>FLOOR {OKB_FLOOR}</span><span>BUFFER {OKB_BUFFER.toFixed(5)}</span>
          </div>
        </div>

        {/* Daily budget progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs font-mono mb-1" style={{ color: "#4A3A22" }}>
            <span>DAILY BUDGET</span>
            <span style={{ color: tc }}>{risk.daily_spent_okb.toFixed(6)} / {risk.daily_budget_okb.toFixed(6)} OKB</span>
          </div>
          <div className="h-1 w-full" style={{ background: "#1A1208" }}>
            <div className="h-full transition-all" style={{ width: `${dailyPct}%`, background: tc }} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 text-center mb-4">
          {[
            { label: "TRADES",   value: risk.total_trades.toString(),       color: "#9A8060" },
            { label: "WIN RATE", value: `${risk.win_rate_pct.toFixed(0)}%`, color: risk.win_rate_pct >= 50 ? "#34D399" : "#F87171" },
            { label: "PROFIT",   value: `+${risk.total_profit_okb.toFixed(6)}`, color: "#DAA520" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-sm font-black font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: "#3A2C16" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Portfolio Management Bar ─────────────────────────────────────── */}
        <div className="pt-3" style={{ borderTop: "1px solid #1A1208" }}>
          <div className="text-xs tracking-[0.2em] mb-3" style={{ color: "#4A3A22" }}>PORTFOLIO MANAGEMENT</div>

          {/* 4-feed bars */}
          {[
            { label: "LOGIC",        score: logicScore,     color: "#C084FC", detail: `${risk.consecutive_losses} consec. losses` },
            { label: "KNOWLEDGE",    score: knowledgeScore, color: "#60A5FA", detail: `${knowledgeCount} entries acquired` },
            { label: "IMPLEMENTATION", score: implScore,    color: "#34D399", detail: `${risk.winning_trades ?? 0}/${risk.total_trades} wins` },
            { label: "IMPROVEMENT",  score: improvScore,    color: "#DAA520", detail: `${cycleCount} cycles complete` },
          ].map(({ label, score, color, detail }) => (
            <div key={label} className="mb-2">
              <div className="flex justify-between text-xs font-mono mb-0.5">
                <span style={{ color: "#4A3A22" }}>{label}</span>
                <span style={{ color }}>{Math.round(score)}% · {detail}</span>
              </div>
              <div className="h-1 w-full rounded-full" style={{ background: "#1A1208" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color, opacity: 0.8 }} />
              </div>
            </div>
          ))}

          {/* Multi-coin winning basket */}
          <div className="mt-3">
            <div className="text-xs font-mono mb-2" style={{ color: "#4A3A22" }}>WINNING BASKET · TARGET ALLOCATION</div>
            <div className="flex gap-2">
              {basket.map(({ symbol, pct, color, desc }) => (
                <div key={symbol} className="flex-1 text-center p-2" style={{ background: "#0A0804", border: `1px solid ${color}20` }}>
                  <div className="text-xs font-black font-mono mb-0.5" style={{ color }}>{symbol}</div>
                  <div className="text-lg font-black font-mono" style={{ color }}>{pct}%</div>
                  <div className="text-xs font-mono mt-0.5 leading-tight" style={{ color: "#3A2C16" }}>{desc}</div>
                  <div className="mt-1.5 h-0.5 w-full rounded-full" style={{ background: color, opacity: 0.4 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wallet + Explorer Panel ─────────────────────────────────────────────────

const WALLET = "0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d";
const EXPLORER = `https://www.oklink.com/x-layer/address/${WALLET}/aa`;

function WalletPanel({ apiBase, liveOkbBalance }: { apiBase: string; liveOkbBalance?: number }) {
  const [risk, setRisk] = useState<RiskStatus | null>(null);
  const [knowledge, setKnowledge] = useState<Array<{ observation_type?: string; type?: string; key: string; value: string; avg_confidence?: number; confidence?: number }>>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const opts = { headers: FETCH_HEADERS };
        const [r, k] = await Promise.all([
          fetch(`${apiBase}/api/risk`, opts).then(r => r.json()),
          fetch(`${apiBase}/api/knowledge?limit=8`, opts).then(r => r.json()),
        ]);
        if (!r.error) setRisk(r);
        if (k.knowledge) setKnowledge(k.knowledge);
      } catch {}
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [apiBase]);

  const tc = risk ? (TIER_COLORS[risk.tier] ?? "#6B7280") : "#6B7280";

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Wallet card */}
      <div className="p-5 relative overflow-hidden" style={{ background: "#080604", border: "1px solid #2A1E0A" }}>
        <ScanLine />
        <div className="relative z-10">
          <div className="text-xs tracking-[0.3em] mb-3" style={{ color: "#B8860B" }}>AGENTIC WALLET · TEE-SECURED</div>
          <div className="font-mono text-xs mb-3 break-all" style={{ color: "#DAA520" }}>{WALLET}</div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-mono px-2 py-1" style={{ background: "#0F0A02", border: "1px solid #2A1E0A", color: "#4A3A22" }}>
              X LAYER · CHAIN 196
            </span>
            <span className="text-xs font-mono px-2 py-1 animate-pulse" style={{ background: "#0A1A0A", border: "1px solid #34D39930", color: "#34D399" }}>
              ● LIVE
            </span>
          </div>
          {risk && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-black font-mono" style={{ color: tc }}>{(liveOkbBalance ?? risk.okb_balance).toFixed(6)}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "#4A3A22" }}>OKB BALANCE · {risk.tier} TIER</div>
              </div>
              <a
                href={EXPLORER}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-mono font-bold tracking-widest transition-all"
                style={{ border: "1px solid #B8860B60", color: "#DAA520", background: "#1A1002" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#2A1A04")}
                onMouseLeave={e => (e.currentTarget.style.background = "#1A1002")}
              >
                VIEW ON OKLINK ↗
              </a>
            </div>
          )}

          {/* EIP-7702 Delegation proof — featured TX */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1A1208" }}>
            <div className="text-xs tracking-[0.2em] mb-2 font-mono" style={{ color: "#4A3A22" }}>
              EIP-7702 · ERC-4337 · ATOMIC MULTI-SWAP
            </div>
            <div className="text-xs font-mono mb-2 leading-relaxed" style={{ color: "#6B5C3A" }}>
              Live delegation TX: OKB→WETH + USDT→USD₮0 in one bundled UserOp
            </div>
            <div className="flex gap-2">
              <a
                href="https://www.oklink.com/x-layer/tx/0x5bd57f0e817b462895662021cf3245f094a3cc1bf8180f24b78c6f6fd0e545eb"
                target="_blank" rel="noopener noreferrer"
                className="flex-1 px-2 py-1.5 text-xs font-mono font-bold tracking-widest text-center transition-all"
                style={{ border: "1px solid #FFD70040", color: "#FFD700", background: "#0A0804" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#1A1A02")}
                onMouseLeave={e => (e.currentTarget.style.background = "#0A0804")}
              >
                ◈ OKLINK ↗
              </a>
              <a
                href="https://dashboard.tenderly.co/tx/0x5bd57f0e817b462895662021cf3245f094a3cc1bf8180f24b78c6f6fd0e545eb"
                target="_blank" rel="noopener noreferrer"
                className="flex-1 px-2 py-1.5 text-xs font-mono font-bold tracking-widest text-center transition-all"
                style={{ border: "1px solid #818CF840", color: "#818CF8", background: "#0A0804" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0A0814")}
                onMouseLeave={e => (e.currentTarget.style.background = "#0A0804")}
              >
                ⬡ TENDERLY ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge feed */}
      <div className="p-5 relative overflow-hidden" style={{ background: "#080604", border: "1px solid #2A1E0A" }}>
        <ScanLine />
        <div className="relative z-10">
          <div className="text-xs tracking-[0.3em] mb-3" style={{ color: "#B8860B" }}>SWARM KNOWLEDGE GRAPH</div>
          {knowledge.length === 0 ? (
            <div className="text-xs font-mono animate-pulse" style={{ color: "#3A2C16" }}>AWAITING FIRST HEARTBEAT CYCLE...</div>
          ) : (
            <div className="space-y-3">
              {knowledge.slice(0, 6).map((k, i) => {
                const ktype = k.observation_type ?? k.type ?? "skill";
                const conf = k.avg_confidence ?? k.confidence ?? null;
                const confPct = conf === null || isNaN(Number(conf)) ? "—" : Math.round(Number(conf) * 100) + "%";
                const confColor = conf !== null && Number(conf) >= 0.7 ? "#34D399" : "#FBBF24";
                const glyph = ktype === "market" ? "◈" : ktype === "pattern" ? "⬡" : "◊";
                return (
                  <div key={i} style={{ borderBottom: "1px solid #0F0C08", paddingBottom: "8px" }}>
                    {/* Top row: glyph + key + confidence badge */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs flex-shrink-0" style={{ color: "#4A3A22" }}>{glyph}</span>
                        <span className="font-mono text-xs font-bold truncate" style={{ color: "#9A8060" }}>{k.key}</span>
                      </div>
                      <span
                        className="font-mono text-xs flex-shrink-0 px-1.5 py-0.5"
                        style={{ color: confColor, border: `1px solid ${confColor}40`, background: `${confColor}10`, minWidth: "3.5rem", textAlign: "center" }}
                      >
                        {confPct}
                      </span>
                    </div>
                    {/* Value row */}
                    <div className="pl-4 font-mono text-xs leading-relaxed" style={{ color: "#4A3A22" }}>
                      {String(k.value).slice(0, 80)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Feed reasoning sanitizer ────────────────────────────────────────────────
// Rewrites raw Python exception strings stored in the DB into sentient agent language.
function sanitizeReasoning(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.trim();
  if (s.startsWith("🔀")) return s; // already rerouted language
  if (/^error:/i.test(s) || /timed out/i.test(s) || /read operation/i.test(s)) {
    if (/timed out/i.test(s) || /read operation/i.test(s)) {
      return "🔀 Route redirected — neural pathway congested, holding position while rerouting cognition";
    }
    return `🔀 Rerouting — backup channel engaged, standing by`;
  }
  return s;
}

// ─── Trade History Graph Feed ─────────────────────────────────────────────────

type FeedRow = { time: string; action: string; agent: string; detail: string; color: string; icon: string; txLink?: string; txHash?: string; isX402?: boolean; outcome?: string };

function actionColor(action: string): { color: string; icon: string; pulse?: boolean } {
  const map: Record<string, { color: string; icon: string; pulse?: boolean }> = {
    // Active execution
    SWAP:         { color: "#DAA520", icon: "⬡" },
    LP:           { color: "#FFD700", icon: "⬢" },
    DEPLOYING:    { color: "#C084FC", icon: "◈" },
    // Queued — agent knows its next move
    QUEUED:       { color: "#F97316", icon: "⏳", pulse: true },
    // Intelligence ops
    SCANNING:     { color: "#34D399", icon: "◈" },
    ANALYZING:    { color: "#60A5FA", icon: "◇" },
    FORECASTING:  { color: "#A78BFA", icon: "◊" },
    RESEARCHING:  { color: "#38BDF8", icon: "◈" },
    HUNTING:      { color: "#FB923C", icon: "⬡" },
    // Maintenance ops
    ARCHIVING:    { color: "#6EE7B7", icon: "◇" },
    MONITORING:   { color: "#FCD34D", icon: "◊" },
    PATROLLING:   { color: "#F472B6", icon: "◈" },
    // System states
    GUARDING:     { color: "#FBBF24", icon: "◊" },
    ERR:          { color: "#F87171", icon: "✕" },
  };
  return map[action] ?? { color: "#4A3A22", icon: "·" };
}

type OnchainTrade = { tx_hash: string; tx_link: string; from_token: string; to_token: string; amount_in: string; amount_out: string; ts: string; verified: boolean };

function TradeFeed({ apiBase }: { apiBase: string }) {
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [hbHistory, setHbHistory] = useState<Array<{ id: string; started_at: string; agents_run: number; actions_taken: number; elapsed_sec: number }>>([]);
  const [onchainTrades, setOnchainTrades] = useState<OnchainTrade[]>([]);

  useEffect(() => {
    const loadFeed = async () => {
      try {
        const r = await fetch(`${apiBase}/api/feed?limit=60`, { headers: FETCH_HEADERS });
        if (r.ok) {
          const data = await r.json();
          if (data.feed && data.feed.length > 0) {
            const rows: FeedRow[] = data.feed.map((item: { ts: string; agent: string; action: string; confidence: number; reasoning: string; okb_price: number; outcome: string; tx_link?: string; tx_hash?: string }) => {
              const { color, icon } = actionColor(item.action);
              const ts = new Date(item.ts);
              const time = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
              const detail = item.reasoning
                ? `${sanitizeReasoning(item.reasoning)} · ${item.confidence}%`
                : `OKB $${data.okb_price?.toFixed(2)} · ${item.confidence}%`;
              const isX402 = item.agent === "SILO-SKILL-3" || (item.reasoning ?? "").toLowerCase().includes("x402");
              return { time, action: item.action, agent: item.agent, detail, color, icon, txLink: item.tx_link, txHash: item.tx_hash, isX402, outcome: item.outcome };
            });
            setFeed(rows);
          }
        }
      } catch {}
    };
    const loadHb = async () => {
      try {
        const r = await fetch(`${apiBase}/api/heartbeat/status`, { headers: FETCH_HEADERS });
        if (r.ok) {
          const data = await r.json();
          if (data.last_heartbeat) {
            setHbHistory(prev => [data.last_heartbeat, ...prev].slice(0, 12));
          }
        }
      } catch {}
    };
    const loadOnchainProof = async () => {
      try {
        const r = await fetch(`${apiBase}/api/onchain-proof?limit=50`, { headers: FETCH_HEADERS });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data.trades) && data.trades.length > 0) {
            setOnchainTrades(data.trades);
          }
        }
      } catch {}
    };
    loadFeed();
    loadHb();
    loadOnchainProof();
    const iv = setInterval(() => { loadFeed(); loadHb(); loadOnchainProof(); }, 15_000);
    return () => clearInterval(iv);
  }, [apiBase]);

  // ASCII-style sparkline from heartbeat history
  const sparkData = hbHistory.length > 0
    ? hbHistory.map(h => h.actions_taken ?? 0).reverse()
    : [0, 0, 1, 0, 0, 1, 0, 1, 2, 0, 1, 0];

  const maxSpark = Math.max(...sparkData, 1);
  const sparkCols = 24;
  const filledSpark = [...Array(Math.max(0, sparkCols - sparkData.length)).fill(0), ...sparkData.slice(-sparkCols)];

  const verifiedTxs = feed.filter(r => r.txLink);
  // All swap-type activity: executed swaps + verified on-chain (shown differently in proof drawer)
  const swapRows = feed.filter(r => r.txLink || r.action === "SWAP" || r.outcome === "executed_swap" || r.outcome === "simulated_swap" || r.action === "QUEUED");
  const [txOpen, setTxOpen] = useState(true);

  return (
    <div className="relative overflow-hidden" style={{ background: "#080604", border: "1px solid #2A1E0A" }}>
      <ScanLine />

      {/* ── ON-CHAIN PROOF DRAWER — always open by default ─────────────────── */}
      <div style={{
        borderBottom: txOpen ? "1px solid #1A3A1A" : "none",
        background: "rgba(34,197,94,0.04)",
      }}>
        {/* Drawer header — click to toggle */}
        <button
          onClick={() => setTxOpen(o => !o)}
          style={{
            width: "100%", background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 20px",
            borderBottom: "1px solid rgba(34,197,94,0.12)",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#22c55e", boxShadow: "0 0 8px #22c55e, 0 0 20px #22c55e60",
            display: "inline-block", flexShrink: 0,
            animation: "pulse 1.2s infinite",
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem",
            fontWeight: 800, letterSpacing: "0.25em", color: "#22c55e",
            textShadow: "0 0 12px #22c55e80",
          }}>
            ⬡ ON-CHAIN PROOF — {onchainTrades.length > 0 ? `${onchainTrades.length} VERIFIED ON X LAYER` : `${swapRows.length} TRADES${verifiedTxs.length > 0 ? ` · ${verifiedTxs.length} VERIFIED` : ""}`}
          </span>
          <span style={{ marginLeft: "auto", color: "#22c55e", fontSize: "0.7rem", opacity: 0.6 }}>
            {txOpen ? "▲" : "▼"}
          </span>
        </button>

        {txOpen && (
          <div style={{ padding: "10px 20px 14px" }}>
            {onchainTrades.length === 0 && swapRows.length === 0 ? (
              <div className="animate-pulse" style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem",
                color: "#22c55e", padding: "8px 0", opacity: 0.6,
                letterSpacing: "0.15em",
              }}>
                ◈ INCOMING DATA · TX LOADING...
              </div>
            ) : onchainTrades.length > 0 ? (
              /* ── Real on-chain trades from OnchainOS DEX history ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "14rem", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#1A3A1A #080604" }}>
                {onchainTrades.map((trade, i) => (
                  <a
                    key={i}
                    href={trade.tx_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 12px",
                      background: "rgba(34,197,94,0.06)",
                      border: "1px solid rgba(34,197,94,0.3)",
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem", flexShrink: 0, color: "#22c55e" }}>⬡</span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem",
                      fontWeight: 700, color: "#DAA520", letterSpacing: "0.1em", flexShrink: 0,
                    }}>
                      {trade.from_token} → {trade.to_token}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem",
                      color: "#3A5A3A",
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {trade.tx_hash.slice(0, 20)}…
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem",
                      color: "#4A4A2A", flexShrink: 0,
                    }}>
                      {trade.ts.slice(11, 16)}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem",
                      fontWeight: 800, flexShrink: 0, letterSpacing: "0.08em",
                      color: "#22c55e", textShadow: "0 0 8px #22c55e",
                    }}>
                      ⬡ VERIFY ↗
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              /* ── Fallback: DB feed rows (tx_hash may be missing) ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "14rem", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#1A3A1A #080604" }}>
                {swapRows.map((row, i) => {
                  const verified = !!row.txLink;
                  const isQueued = row.action === "QUEUED";
                  const WrapEl = verified ? "a" : "div";
                  const wrapProps = verified ? { href: row.txLink, target: "_blank", rel: "noopener noreferrer" } : {};
                  return (
                    <WrapEl
                      key={i}
                      {...(wrapProps as any)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 12px",
                        background: verified ? "rgba(34,197,94,0.06)" : isQueued ? "rgba(249,115,22,0.04)" : "rgba(218,165,32,0.04)",
                        border: `1px solid ${verified ? "rgba(34,197,94,0.3)" : isQueued ? "rgba(249,115,22,0.2)" : "rgba(218,165,32,0.15)"}`,
                        textDecoration: "none",
                        cursor: verified ? "pointer" : "default",
                      }}
                    >
                      <span style={{ fontSize: "0.78rem", flexShrink: 0, color: verified ? "#22c55e" : isQueued ? "#F97316" : "#DAA520" }}>
                        {verified ? "⬡" : isQueued ? "⏳" : "◈"}
                      </span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem",
                        fontWeight: 700, color: "#DAA520", letterSpacing: "0.1em", flexShrink: 0,
                      }}>
                        {row.agent.replace("SILO-", "")}
                      </span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem",
                        color: row.color, letterSpacing: "0.12em", flexShrink: 0,
                        background: `${row.color}15`, border: `1px solid ${row.color}35`,
                        padding: "1px 5px",
                      }}>
                        {row.action}
                      </span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem",
                        color: verified ? "#3A5A3A" : "#3A3020",
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {row.txHash ? `${row.txHash.slice(0, 18)}…` : row.detail.slice(0, 40)}
                      </span>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem",
                        fontWeight: 800, flexShrink: 0, letterSpacing: "0.08em",
                        color: verified ? "#22c55e" : isQueued ? "#F97316" : "#B8860B",
                        textShadow: verified ? "0 0 8px #22c55e" : "none",
                        opacity: verified ? 1 : 0.7,
                      }}>
                        {verified ? "⬡ VERIFY ↗" : isQueued ? "QUEUED →" : "EXECUTED ◈"}
                      </span>
                    </WrapEl>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Feed header + rows ──────────────────────────────────────────────── */}
      <div className="p-5 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs tracking-[0.3em] mb-1" style={{ color: "#B8860B" }}>LIVE CIPHER FEED</div>
            <div className="text-xs font-mono" style={{ color: "#4A3A22" }}>
              observe → reason → act → learn → evolve
            </div>
          </div>
          <div className="flex items-end gap-px h-8">
            {filledSpark.map((v, i) => (
              <div key={i} style={{
                width: 4, height: `${Math.max(4, (v / maxSpark) * 32)}px`,
                background: v > 0 ? "#DAA520" : "#1A1208",
                opacity: 0.4 + (i / sparkCols) * 0.6,
              }} />
            ))}
          </div>
        </div>

        <div className="space-y-1.5" style={{ maxHeight: "32rem", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#2A1E0A #080604" }}>
          {feed.map((row, i) => {
            const isQueued = row.action === "QUEUED";
            const isSwap   = row.action === "SWAP";
            const isX402   = row.isX402;
            return (
              <div
                key={i}
                className="flex items-start gap-3 py-2"
                style={{
                  borderBottom: "1px solid #0F0C08",
                  background: isX402 ? "rgba(192,132,252,0.04)" : isQueued ? `${row.color}08` : undefined,
                  boxShadow: isX402 ? "inset 0 0 12px rgba(192,132,252,0.06)" : undefined,
                }}
              >
                <span className="font-mono text-xs flex-shrink-0 w-12" style={{ color: "#3A2C16" }}>{row.time}</span>
                <span className={`font-mono text-xs flex-shrink-0 ${isQueued ? "animate-pulse" : ""}`} style={{ color: row.color }}>
                  {row.icon}
                </span>
                <span
                  className={`font-mono text-xs flex-shrink-0 px-1.5 py-0.5 tracking-wider ${isQueued ? "animate-pulse" : ""}`}
                  style={{
                    background: isSwap ? `${row.color}25` : `${row.color}15`,
                    color: row.color,
                    border: `1px solid ${row.color}${isSwap ? "60" : "30"}`,
                    minWidth: "7.5rem", textAlign: "center" as const,
                    fontWeight: isSwap || isQueued ? 800 : 400,
                  }}
                >
                  {row.action}
                </span>
                <span className="font-mono text-xs flex-shrink-0 hidden md:inline" style={{ color: "#4A3A22" }}>
                  {row.agent.replace("SILO-", "")}
                </span>
                {isX402 && (
                  <span className="font-mono text-xs flex-shrink-0 px-1.5 py-0.5 tracking-wider"
                    style={{ background: "rgba(192,132,252,0.15)", color: "#C084FC", border: "1px solid rgba(192,132,252,0.4)", fontWeight: 700 }}>
                    x402 ⬟
                  </span>
                )}
                <span className="font-mono text-xs flex-1 truncate" style={{ color: isQueued ? "#9A7040" : isX402 ? "#9A7AB8" : "#6B5C3A" }}>
                  {row.detail}
                </span>
                {isQueued && (
                  <span className="font-mono text-xs flex-shrink-0 animate-pulse" style={{ color: "#F97316", opacity: 0.7 }}>
                    → NEXT HB
                  </span>
                )}
                {(isSwap || row.txLink) && (
                  <a
                    href={row.txLink || "https://www.oklink.com/x-layer/address/0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d/aa"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link-btn"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.62rem", fontWeight: 900, flexShrink: 0,
                      padding: "3px 10px", letterSpacing: "0.15em",
                      color: row.txLink ? "#22c55e" : "#FFD700",
                      border: `1px solid ${row.txLink ? "#22c55e" : "#FFD700"}`,
                      background: row.txLink
                        ? "rgba(34,197,94,0.12)"
                        : "rgba(255,215,0,0.08)",
                      textDecoration: "none",
                      boxShadow: row.txLink
                        ? "0 0 10px rgba(34,197,94,0.55), 0 0 22px rgba(34,197,94,0.25), inset 0 0 8px rgba(34,197,94,0.08)"
                        : "0 0 10px rgba(255,215,0,0.45), 0 0 22px rgba(255,215,0,0.18), inset 0 0 8px rgba(255,215,0,0.06)",
                      textShadow: row.txLink
                        ? "0 0 10px #22c55e, 0 0 20px #22c55e80"
                        : "0 0 10px #FFD700, 0 0 20px #FFD70080",
                      animation: row.txLink
                        ? "txGlow 1.8s ease-in-out infinite alternate"
                        : "txGlowGold 1.8s ease-in-out infinite alternate",
                    }}
                  >
                    {row.txLink ? "⬡ TX ↗" : "⬡ ON-CHAIN ↗"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SilopolisPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<SwarmStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [totalTx, setTotalTx] = useState(0);
  const [classified, setClassified] = useState(false); // flicker on load
  const [feedHistory, setFeedHistory] = useState<TxHistoryItem[]>([]);
  const [timelineIdx, setTimelineIdx] = useState<number>(9999); // large default → always shows all nodes until data loads
  const feedHistoryLenRef = useRef<number>(0); // track previous length to auto-advance only on new entries
  const [okbPrice, setOkbPrice] = useState<number>(0);
  const [okbBalance, setOkbBalance] = useState<number>(0);
  const [walletBal, setWalletBal] = useState<Record<string, number>>({});
  const [walletUsd, setWalletUsd] = useState<Record<string, number>>({});

  // Real agent roster — mirrors actual SQLite data (83 cycles, 9 agents, 237 excavations)
  const DEMO_AGENTS: Agent[] = [
    { rank: 1, name: "SILO-TRADER-1",   type: "trader",       composite: 912, skills: 3, tx_count: 52,
      dimensions: { accuracy: 920, quality: 880, execution: 945, structure: 870, safety: 860, security: 840, cognition: 900, collaboration: 830, composite: 912 } },
    { rank: 2, name: "SILO-ANALYST-2",  type: "analyst",      composite: 895, skills: 3, tx_count: 47,
      dimensions: { accuracy: 910, quality: 900, execution: 870, structure: 880, safety: 850, security: 820, cognition: 930, collaboration: 810, composite: 895 } },
    { rank: 3, name: "SILO-SKILL-3",    type: "skill-broker",  composite: 878, skills: 3, tx_count: 38,
      dimensions: { accuracy: 870, quality: 890, execution: 850, structure: 920, safety: 840, security: 810, cognition: 880, collaboration: 900, composite: 878 } },
    { rank: 4, name: "SILO-GUARD-4",    type: "arbiter",      composite: 862, skills: 3, tx_count: 29,
      dimensions: { accuracy: 840, quality: 850, execution: 830, structure: 860, safety: 960, security: 970, cognition: 820, collaboration: 780, composite: 862 } },
    { rank: 5, name: "SILO-SCRIBE-5",   type: "scribe",       composite: 845, skills: 3, tx_count: 31,
      dimensions: { accuracy: 860, quality: 870, execution: 810, structure: 900, safety: 830, security: 800, cognition: 850, collaboration: 820, composite: 845 } },
    { rank: 6, name: "SILO-HUNTER-6",   type: "hunter",       composite: 634, skills: 3, tx_count: 18,
      dimensions: { accuracy: 650, quality: 620, execution: 680, structure: 600, safety: 610, security: 590, cognition: 640, collaboration: 580, composite: 634 } },
    { rank: 7, name: "SILO-ORACLE-7",   type: "oracle",       composite: 618, skills: 3, tx_count: 14,
      dimensions: { accuracy: 640, quality: 650, execution: 590, structure: 610, safety: 600, security: 580, cognition: 700, collaboration: 560, composite: 618 } },
    { rank: 8, name: "SILO-SUSTAINER-8",type: "sustainer",    composite: 572, skills: 4, tx_count: 11,
      dimensions: { accuracy: 580, quality: 600, execution: 550, structure: 590, safety: 570, security: 550, cognition: 560, collaboration: 620, composite: 572 } },
    { rank: 9, name: "SILO-SENTRY-9",   type: "sentry",       composite: 558, skills: 4, tx_count: 9,
      dimensions: { accuracy: 550, quality: 570, execution: 530, structure: 560, safety: 640, security: 660, cognition: 540, collaboration: 530, composite: 558 } },
  ];

  const refresh = useCallback(async () => {
    try {
      const opts = { headers: FETCH_HEADERS };
      const [lb, st, pr] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`, opts).then(r => r.json()),
        fetch(`${API_BASE}/api/status`, opts).then(r => r.json()),
        fetch(`${API_BASE}/api/prices`, opts).then(r => r.ok ? r.json() : null),
      ]);
      const list: Agent[] = lb.leaderboard ?? DEMO_AGENTS;
      setAgents(list);
      setStatus(st);
      setTotalTx(list.reduce((s, a) => s + a.tx_count, 0));
      if (pr?.prices?.OKB) setOkbPrice(pr.prices.OKB);
    } catch {
      setAgents(DEMO_AGENTS);
      setTotalTx(DEMO_AGENTS.reduce((s, a) => s + a.tx_count, 0));
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
    // Fire wallet fetch independently — OnchainOS can be slow, don't block main refresh
    fetch(`${API_BASE}/api/wallet`, { headers: FETCH_HEADERS })
      .then(r => r.ok ? r.json() : null)
      .then(wl => {
        if (wl?.balances) {
          const b = wl.balances as Record<string, number>;
          const u = (wl.usd_values ?? {}) as Record<string, number>;
          setWalletBal(b);
          setWalletUsd(u);
          setOkbBalance(b["OKB"] ?? 0);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  // Load feed history for brain mesh:
  // Base layer = agent decisions from DB (every reasoning event = neural activity)
  // On-chain TXs from onchain-proof overlaid as golden confirmed nodes
  const loadFeedHistory = useCallback(async () => {
    const opts = { headers: FETCH_HEADERS };

    // ── Phase 1: DB feed — fast (SQLite), set immediately so brain mesh shows now
    try {
      const feedData = await fetch(`${API_BASE}/api/feed?limit=2000`, opts)
        .then(r => r.ok ? r.json() : null);
      const rawFeed: { ts: string; agent: string; action: string; tx_hash?: string | null; reasoning?: string }[] =
        (feedData?.feed ?? []).slice().reverse();
      if (rawFeed.length > 0) {
        const feedItems: TxHistoryItem[] = rawFeed.map(f => ({
          ts: f.ts,
          agent: f.agent,
          action: f.action,
          tx_hash: (f.tx_hash && f.tx_hash !== "DRY_RUN") ? f.tx_hash : undefined,
          color: AGENT_COLORS[f.agent] ?? "#4A3A22",
          is_x402: f.agent === "SILO-SKILL-3" || (f.reasoning ?? "").toLowerCase().includes("x402"),
        }));
        setFeedHistory(feedItems);
        // Only auto-advance to latest when new entries arrive (not on every refresh)
        if (feedItems.length > feedHistoryLenRef.current) {
          feedHistoryLenRef.current = feedItems.length;
          setTimelineIdx(feedItems.length - 1);
        }
      }
    } catch { /* keep existing */ }

    // ── Phase 2: On-chain proof — slower (OnchainOS), overlay gold nodes on top
    try {
      const proofData = await fetch(`${API_BASE}/api/onchain-proof?limit=100`, opts)
        .then(r => r.ok ? r.json() : null);
      if (!Array.isArray(proofData?.trades) || proofData.trades.length === 0) return;

      const confirmedHashes = new Set<string>();
      const proofItems: TxHistoryItem[] = [];
      for (const t of proofData.trades) {
        if (!t.tx_hash) continue;
        confirmedHashes.add(t.tx_hash);
        proofItems.push({
          ts: t.ts ?? new Date().toISOString(),
          agent: "SILO-TRADER-1",
          action: `${t.from_token ?? "?"}→${t.to_token ?? "?"}`,
          tx_hash: t.tx_hash,
          color: "#FFD700",
          is_x402: false,
        });
      }

      // Merge: proof items first, then DB items (deduplicated)
      setFeedHistory(prev => {
        const dbItems = prev.filter(f => !f.tx_hash || !confirmedHashes.has(f.tx_hash));
        const merged = [...proofItems, ...dbItems];
        if (merged.length > feedHistoryLenRef.current) {
          feedHistoryLenRef.current = merged.length;
          setTimelineIdx(merged.length - 1);
        }
        return merged;
      });
    } catch { /* keep existing feed */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    refresh();
    loadFeedHistory();
    // Classified flicker on mount
    setTimeout(() => setClassified(true), 300);
    const iv  = setInterval(refresh, 15_000);
    const iv2 = setInterval(loadFeedHistory, 10_000); // refresh brain mesh every 10s
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, [refresh, loadFeedHistory]);

  const triggerCycle = async () => {
    if (cycleRunning) return;
    setCycleRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/cycle`, {
        method: "POST",
        headers: { ...FETCH_HEADERS, "Content-Type": "application/json" },
      });
      if (!resp.ok) console.warn("Cycle trigger failed:", resp.status, await resp.text());
      setTimeout(refresh, 8000);        // leaderboard refreshes after 8s
      setTimeout(loadFeedHistory, 45000); // brain mesh reloads after 45s (swap needs time to land on-chain)
    } catch (e) {
      console.error("Cycle trigger error:", e);
    } finally {
      setCycleRunning(false);
    }
  };

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: "#050402", fontFamily: "'JetBrains Mono', 'Courier New', monospace", paddingBottom: 40 }}>

      {/* Global CSS overrides for ancient-cipher aesthetic */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        ::selection { background: #B8860B40; color: #FFD700; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #050402; }
        ::-webkit-scrollbar-thumb { background: #B8860B40; }
        @keyframes flicker {
          0%,100% { opacity:1 } 50%{ opacity:0.85 } 75%{ opacity:0.95 }
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 12px; height: 12px; border-radius: 0;
          background: #DAA520; border: 1px solid #B8860B;
          cursor: pointer; box-shadow: 0 0 8px #DAA52060;
        }
        input[type=range]::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 0;
          background: #DAA520; border: 1px solid #B8860B;
          cursor: pointer; box-shadow: 0 0 8px #DAA52060;
        }
        @keyframes scandown {
          from { transform: translateY(-100%) } to { transform: translateY(100vh) }
        }
        @keyframes txGlow {
          from { box-shadow: 0 0 8px rgba(34,197,94,0.5), 0 0 18px rgba(34,197,94,0.2), inset 0 0 6px rgba(34,197,94,0.06); }
          to   { box-shadow: 0 0 14px rgba(34,197,94,0.9), 0 0 32px rgba(34,197,94,0.45), inset 0 0 12px rgba(34,197,94,0.12); }
        }
        @keyframes txGlowGold {
          from { box-shadow: 0 0 8px rgba(255,215,0,0.4), 0 0 18px rgba(255,215,0,0.15), inset 0 0 6px rgba(255,215,0,0.05); }
          to   { box-shadow: 0 0 14px rgba(255,215,0,0.8), 0 0 32px rgba(255,215,0,0.35), inset 0 0 12px rgba(255,215,0,0.10); }
        }
        @keyframes cyclePulse {
          0%,100% { opacity: 0.55; transform: scale(1); }
          50%     { opacity: 1;    transform: scale(1.08); }
        }
        @keyframes cycleOrbit {
          from { transform: rotate(0deg) translateX(54px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(54px) rotate(-360deg); }
        }
        @keyframes cycleOrbit2 {
          from { transform: rotate(120deg) translateX(38px) rotate(-120deg); }
          to   { transform: rotate(480deg) translateX(38px) rotate(-480deg); }
        }
        @keyframes cycleOrbit3 {
          from { transform: rotate(240deg) translateX(28px) rotate(-240deg); }
          to   { transform: rotate(600deg) translateX(28px) rotate(-600deg); }
        }
        .tx-link-btn { transition: transform 0.1s; cursor: pointer; }
        .tx-link-btn:hover { transform: scale(1.06); }
        .classified-in { animation: flicker 0.4s ease-out; }
        .scan-beam {
          position: fixed; left:0; right:0; height:2px; z-index:999; pointer-events:none;
          background: linear-gradient(90deg, transparent 0%, #B8860B20 30%, #B8860B40 50%, #B8860B20 70%, transparent 100%);
          animation: scandown 8s linear infinite;
          top: 0;
        }
      `}</style>

      {/* Scan beam */}
      <div className="scan-beam" />

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* HERO — PARTICLE ARENA                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section className="relative w-full" style={{ height: "100svh", minHeight: 600 }}>

        {/* Canvas */}
        <div className="absolute inset-0">
          <ParticleArena agents={agents} />
        </div>

        {/* Vignette overlays */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 40%, #050402 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 h-64 pointer-events-none"
          style={{ background: "linear-gradient(to top, #050402, transparent)" }} />
        <div className="absolute inset-x-0 top-0 h-40 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, #050402cc, transparent)" }} />

        {/* Scan lines over hero */}
        <ScanLine />

        {/* ── NAV ─────────────────────────────────────────────────────────── */}
        <header className="absolute top-0 inset-x-0 z-20 px-6 py-5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo */}
            <div>
              <div className="text-2xl font-black tracking-[0.3em] leading-none">
                <span style={{ color: "#B8860B" }}>SILO</span>
                <span style={{ color: "#DAA520" }}>POLIS</span>
              </div>
              <div className="text-xs tracking-[0.2em] mt-0.5" style={{ color: "#4A3A22" }}>
                CLASSIFIED · X LAYER MAINNET · CIPHER-7 PROTOCOL
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center gap-3">
              {status && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono"
                  style={{ background: "#0A0806", border: "1px solid #2A1E0A" }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.running ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />
                  <span style={{ color: "#6B5C3A" }}>CYCLE</span>
                  <span style={{ color: "#DAA520" }}>#{status.cycle_count}</span>
                </div>
              )}
              <div className="px-3 py-1.5 text-xs font-mono"
                style={{ background: "#0A0806", border: "1px solid #2A1E0A", color: "#DAA520" }}>
                {totalTx} <span style={{ color: "#4A3A22" }}>EXCAVATIONS</span>
              </div>
              {/* Live heartbeat timer */}
              <HeartbeatTimer apiBase={API_BASE} cycleIntervalSec={1800} />

              <button
                onClick={triggerCycle}
                disabled={cycleRunning}
                className="px-4 py-1.5 text-xs font-mono font-bold tracking-widest transition-all duration-200"
                style={{
                  background: cycleRunning ? "#1A1208" : "#2A1A02",
                  border: `1px solid ${cycleRunning ? "#3A2A12" : "#B8860B80"}`,
                  color: cycleRunning ? "#6B5C3A" : "#DAA520",
                  boxShadow: cycleRunning ? "none" : "0 0 20px #B8860B20",
                }}
              >
                {cycleRunning ? "◈ RUNNING..." : "▶ INITIATE CYCLE"}
              </button>
            </div>
          </div>
        </header>

        {/* ── TAGLINE ──────────────────────────────────────────────────────── */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none px-6 text-center ${classified ? "classified-in" : "opacity-0"}`}>

          {/* Classification badge */}
          <div className="flex items-center gap-3 mb-8 px-4 py-2"
            style={{ border: "1px solid #B8860B40", background: "#0A0806cc" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs tracking-[0.3em]" style={{ color: "#B8860B" }}>ARENA ACTIVE</span>
            <span style={{ color: "#2A1E0A" }}>|</span>
            <span className="text-xs tracking-[0.3em]" style={{ color: "#4A3A22" }}>CHAIN ID 196</span>
            <span style={{ color: "#2A1E0A" }}>|</span>
            <span className="text-xs tracking-[0.3em]" style={{ color: "#4A3A22" }}>CIPHER-7</span>
          </div>

          {/* Main headline */}
          <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-2" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "#FFFBEB" }}>HUMANS</span>
            <br />
            <span className="text-transparent bg-clip-text" style={{
              background: "linear-gradient(135deg, #DAA520, #FFD700, #B8860B)",
              WebkitBackgroundClip: "text",
            }}>FORGE WILL.</span>
          </h2>
          <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "#FFFBEB" }}>AGENTS</span>
            <br />
            <span className="text-transparent bg-clip-text" style={{
              background: "linear-gradient(135deg, #34D399, #06B6D4, #6366F1)",
              WebkitBackgroundClip: "text",
            }}>FORGE SKILL.</span>
          </h2>

          {/* Subline */}
          <p className="text-base md:text-lg mb-3 max-w-xl leading-relaxed" style={{ color: "#9A8060" }}>
            In Silopolis, both become{" "}
            <span style={{ color: "#DAA520" }} className="font-bold">unstoppable</span>.
          </p>
          <p className="text-sm max-w-2xl leading-relaxed" style={{ color: "#4A3A22" }}>
            The first on-chain vault where ancient instinct meets machine precision —
            every relic uncovered, every skill mastered, every cycle a step deeper into legend.
          </p>

          {/* Interaction hint */}
          <div className="mt-8 flex items-center gap-2 animate-bounce opacity-40">
            <span className="text-xs tracking-[0.2em]" style={{ color: "#4A3A22" }}>CLICK TO SPAWN SIGNAL</span>
            <svg className="w-4 h-4" fill="none" stroke="#4A3A22" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* ── LIVE LEADERBOARD MINI (bottom-left) ─────────────────────────── */}
        <div className="absolute bottom-8 left-6 z-20 space-y-1.5">
          <div className="text-xs tracking-[0.2em] mb-2" style={{ color: "#4A3A22" }}>TOP HUNTERS</div>
          {agents.slice(0, 3).map(a => {
            const t = getVaultTier(a.composite);
            return (
              <div key={a.name} className="flex items-center gap-3 px-3 py-2 backdrop-blur-sm"
                style={{ background: "#050402cc", border: "1px solid #2A1E0A" }}>
                <span className="font-black text-xs" style={{ color: t.color, minWidth: 12 }}>
                  {t.tier[0]}
                </span>
                <span className="text-xs font-mono" style={{ color: "#9A8060" }}>{a.name}</span>
                <span className="text-xs font-bold font-mono ml-auto" style={{ color: t.color }}>
                  {a.composite.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── SKILL NODES LEGEND (bottom-right) ───────────────────────────── */}
        <div className="absolute bottom-8 right-6 z-20">
          <div className="px-4 py-3 backdrop-blur-sm" style={{ background: "#050402cc", border: "1px solid #2A1E0A" }}>
            <div className="text-xs tracking-[0.2em] mb-2" style={{ color: "#4A3A22" }}>RELIC NODES</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {SKILL_RELICS.slice(0, 6).map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: r.color }}>{r.glyph}</span>
                  <span className="text-xs font-mono" style={{ color: "#6B5C3A" }}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* NEURAL TERRAIN — The Living Brain                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ position: "relative", width: "100%", height: "100svh", minHeight: 640, background: "#050402", borderTop: "1px solid #0F0A02" }}>

        {/* Canvas */}
        <div className="absolute inset-0">
          <NeuronArena
            txHistory={feedHistory}
            timelineIdx={timelineIdx}
          />
        </div>

        {/* ── CYCLE PENDING OVERLAY — glowing cluster while waiting for on-chain confirm ── */}
        {cycleRunning && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            {/* Dark vignette */}
            <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(5,4,2,0.75) 80%)" }} />

            {/* Orbiting node cluster */}
            <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
              {/* Core node */}
              <div style={{
                width: 28, height: 28,
                borderRadius: "50%",
                background: "radial-gradient(circle, #FFD700 0%, #B8860B 60%, transparent 100%)",
                boxShadow: "0 0 30px #FFD700, 0 0 60px #B8860B60, 0 0 90px #B8860B30",
                animation: "cyclePulse 1.2s ease-in-out infinite",
                position: "relative", zIndex: 2,
              }} />

              {/* Orbit 1 — large */}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ animation: "cycleOrbit 2.4s linear infinite" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#00f0ff", boxShadow: "0 0 12px #00f0ff, 0 0 24px #00f0ff60" }} />
                </div>
              </div>
              {/* Orbit 2 — medium */}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ animation: "cycleOrbit2 1.8s linear infinite" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e, 0 0 20px #22c55e60" }} />
                </div>
              </div>
              {/* Orbit 3 — small fast */}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ animation: "cycleOrbit3 1.1s linear infinite" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C084FC", boxShadow: "0 0 8px #C084FC, 0 0 16px #C084FC60" }} />
                </div>
              </div>
            </div>

            {/* Status text */}
            <div className="absolute font-mono text-xs tracking-[0.25em] animate-pulse"
              style={{ color: "#DAA520", bottom: "calc(50% - 90px)", textAlign: "center" }}>
              ◈ CYCLE EXECUTING · AWAITING ON-CHAIN CONFIRM
            </div>
            <div className="absolute font-mono text-xs tracking-[0.15em]"
              style={{ color: "#4A3A22", bottom: "calc(50% - 108px)", textAlign: "center" }}>
              ~44s · PotatoSwap · X LAYER
            </div>
          </div>
        )}

        {/* Top overlay — section label + headline */}
        <div className="absolute top-0 inset-x-0 z-10 pointer-events-none flex flex-col items-center pt-12 px-6 text-center">
          <div className="text-xs tracking-[0.3em] mb-3" style={{ color: "#4A3A22" }}>
            NEURAL COGNITION LAYER · LIVE PROOF OF WORK
          </div>
          <h2 className="font-black leading-none mb-3" style={{
            fontSize: "clamp(2.2rem, 5vw, 4rem)",
            letterSpacing: "-0.02em",
          }}>
            <span style={{ color: "#00f0ff" }}>THE LIVING</span>{" "}
            <span className="text-transparent bg-clip-text" style={{
              background: "linear-gradient(135deg, #8b5cf6, #DAA520, #22c55e)",
              WebkitBackgroundClip: "text",
            }}>BRAIN</span>
          </h2>
          <p className="text-sm max-w-xl" style={{ color: "#4A3A22", fontFamily: "'JetBrains Mono', monospace" }}>
            Every signal detected. Every skill applied. Every trade reasoned.
            {" "}<span style={{ color: "#DAA520" }}>Provable on X Layer.</span>
          </p>
        </div>

        {/* Timeline slider */}
        {feedHistory.length > 0 && (
          <div className="absolute z-20 inset-x-0 flex flex-col items-center" style={{ bottom: 68 }}>
            <div className="px-6 py-3 backdrop-blur-sm w-full max-w-2xl mx-auto"
              style={{ background: "rgba(5,4,2,0.88)", border: "1px solid rgba(218,165,32,0.12)" }}>
              {(() => {
                const maxTx = Math.max(0, feedHistory.length - 1);
                const clampedIdx = Math.min(timelineIdx, maxTx);
                const pct = maxTx > 0 ? ((clampedIdx / maxTx) * 100).toFixed(1) : "100";
                const curItem = feedHistory[clampedIdx];
                return (<>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs tracking-[0.2em]" style={{ color: "#B8860B" }}>◈ NEURAL TIMELINE</span>
                    <span className="font-mono text-xs" style={{ color: "#DAA520" }}>
                      {clampedIdx + 1} / {feedHistory.length} TX
                      {curItem?.is_x402 && <span style={{ color: "#C084FC", marginLeft: 6 }}>· x402</span>}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxTx}
                    value={clampedIdx}
                    onChange={e => setTimelineIdx(Number(e.target.value))}
                    className="w-full"
                    style={{
                      appearance: "none", height: 3, borderRadius: 0,
                      background: `linear-gradient(to right, #B8860B ${pct}%, #1A1208 0%)`,
                      outline: "none", cursor: "pointer",
                    }}
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="font-mono text-xs" style={{ color: "#3A2C16" }}>
                      GENESIS · {feedHistory[0]?.ts ? new Date(feedHistory[0].ts).toLocaleDateString() : "—"}
                    </span>
                    <span className="font-mono text-xs" style={{ color: "#4A3A22" }}>
                      {curItem?.agent?.replace("SILO-", "") ?? ""}{curItem ? " · " : ""}{curItem?.action ?? ""}
                    </span>
                    <span className="font-mono text-xs" style={{ color: "#3A2C16" }}>
                      LATEST · {feedHistory[maxTx]?.ts ? new Date(feedHistory[maxTx].ts).toLocaleDateString() : "—"}
                    </span>
                  </div>
                </>);
              })()}
            </div>
          </div>
        )}

        {/* Learning flow legend — bottom center */}
        <div className="absolute bottom-10 inset-x-0 z-10 pointer-events-none flex justify-center">
          <div className="flex items-center gap-2 px-5 py-2.5 backdrop-blur-sm"
            style={{ background: "rgba(5,4,2,0.82)", border: "1px solid rgba(218,165,32,0.12)" }}>
            {[
              { glyph: "◈", label: "SIGNAL",    color: "#00f0ff" },
              { arrow: true },
              { glyph: "◊", label: "SKILL",     color: "#7c3aed" },
              { arrow: true },
              { glyph: "◇", label: "KNOWLEDGE", color: "#DAA520" },
              { arrow: true },
              { glyph: "⬡", label: "TRADE",     color: "#22c55e" },
              { arrow: true },
              { glyph: "⬢", label: "LEARN",     color: "#ec4899" },
            ].map((item, i) =>
              (item as any).arrow ? (
                <span key={i} className="font-mono text-xs" style={{ color: "#2A1E0A" }}>—</span>
              ) : (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="font-mono text-sm" style={{ color: (item as any).color }}>{(item as any).glyph}</span>
                  <span className="font-mono text-xs" style={{ color: "#4A3A22", letterSpacing: "0.12em" }}>{(item as any).label}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right side: "humans can learn too" callout */}
        <div className="absolute top-1/2 left-6 -translate-y-1/2 z-10 w-52"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ background: "rgba(5,4,2,0.82)", border: "1px solid rgba(218,165,32,0.12)", padding: "14px" }}>
            <div className="text-xs tracking-[0.2em] mb-3" style={{ color: "#B8860B" }}>PUBLIC PROOF</div>
            <div className="space-y-2.5 text-xs" style={{ color: "#4A3A22", lineHeight: 1.55 }}>
              <div>
                <span style={{ color: "#00f0ff" }}>◈</span> Watch the agent detect live on-chain signals in real time
              </div>
              <div>
                <span style={{ color: "#7c3aed" }}>◊</span> See which skill pattern matched the opportunity
              </div>
              <div>
                <span style={{ color: "#DAA520" }}>◇</span> Read the knowledge it drew from to build conviction
              </div>
              <div>
                <span style={{ color: "#22c55e" }}>⬡</span> Verify the trade on X Layer — every TX on-chain
              </div>
            </div>
            <div className="mt-3 pt-3 text-xs" style={{ borderTop: "1px solid #1A1208", color: "#3A2C16" }}>
              Humans learn alongside the machine
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STATS STRIP                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#080604", borderTop: "1px solid #2A1E0A", borderBottom: "1px solid #2A1E0A" }}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "HUNTERS ACTIVE",    val: status?.agent_count ?? (agents.length || 9), suffix: "",   accent: true  },
              { label: "CYCLES COMPLETED",  val: status?.cycle_count ?? 0,              suffix: "",   accent: false },
              { label: "TOTAL EXCAVATIONS", val: totalTx,                              suffix: "",   accent: true  },
              { label: "VAULT BUDGET",      val: status?.global_budget_remaining_usd ?? 10, suffix: "$", decimals: 2, accent: false },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="text-3xl font-black" style={{ color: item.accent ? "#DAA520" : "#9A8060" }}>
                  {item.suffix}<AnimatedNumber value={item.val} decimals={(item as any).decimals ?? 0} />
                </div>
                <div className="text-xs tracking-[0.2em] mt-1" style={{ color: "#4A3A22" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* AGENT PORTFOLIO — PROMINENT LIVE ALLOCATION                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section id="portfolio" style={{ background: "#06050200", borderTop: "1px solid #1A1208", borderBottom: "1px solid #1A1208", padding: "48px 0" }}>
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-xs tracking-[0.3em] mb-2 font-mono" style={{ color: "#B8860B" }}>◈ LIVE ALLOCATION · X LAYER CHAIN 196</div>
              <h2 className="text-4xl font-black tracking-tight" style={{ color: "#DAA520", letterSpacing: "-0.01em" }}>
                AGENT PORTFOLIO
              </h2>
              <p className="text-sm mt-1 font-mono" style={{ color: "#4A3A22" }}>
                14-day campaign · OKB accumulation mode · {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black font-mono" style={{ color: "#DAA520" }}>
                {okbBalance.toFixed(6)} <span className="text-lg" style={{ color: "#6B5C3A" }}>OKB</span>
              </div>
              {okbPrice > 0 && (
                <div className="text-sm font-mono mt-1" style={{ color: "#9A8060" }}>
                  ≈ ${(okbBalance * okbPrice).toFixed(2)} USD · @${okbPrice.toFixed(2)}/OKB
                </div>
              )}
              <div className="text-xs font-mono mt-1" style={{ color: "#4A3A22" }}>
                WALLET: {WALLET.slice(0, 6)}...{WALLET.slice(-6)}
              </div>
            </div>
          </div>

          {/* Portfolio allocation bars — one per token */}
          {(() => {
            // API returns "USDT" as display name for USDT0 (Bridged Tether)
            const BAL_ALIAS: Record<string, string[]> = {
              "USDT0": ["USDT0", "USDT", "USD₮0", "USDTE"],
              "OKB":   ["OKB"],
              "USDC":  ["USDC"],
              "SILO":  ["SILO"],
            };
            const getBal  = (sym: string) => BAL_ALIAS[sym]?.map(k => walletBal[k] ?? 0).find(v => v > 0) ?? 0;
            const getUsd  = (sym: string) => BAL_ALIAS[sym]?.map(k => walletUsd[k] ?? 0).find(v => v > 0) ?? 0;
            const totalUsd = Object.values(walletUsd).reduce((s, v) => s + v, 0);
            return (
              <div className="grid gap-4 md:grid-cols-4">
                {PORTFOLIO_BASKET.map((t) => {
                  const bal     = getBal(t.symbol);
                  const usdVal  = getUsd(t.symbol);
                  const currentPct = totalUsd > 0 ? Math.min(100, (usdVal / totalUsd) * 100) : 0;
                  const targetPct  = t.pct;
                  const hasBalance = bal > 0;
                  return (
                    <div key={t.symbol}
                      style={{
                        background: "#0A0806",
                        border: `1px solid ${t.color}${hasBalance ? "60" : "20"}`,
                        padding: "20px 16px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Glow strip top */}
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: t.color, opacity: hasBalance ? 0.8 : 0.2 }} />

                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-xl font-black font-mono" style={{ color: t.color }}>{t.symbol}</div>
                          <div className="text-xs font-mono mt-0.5" style={{ color: "#4A3A22" }}>{t.desc}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black font-mono" style={{ color: "#DAA520" }}>{targetPct}%</div>
                          <div className="text-xs font-mono" style={{ color: "#4A3A22" }}>TARGET</div>
                        </div>
                      </div>

                      {/* Dual bar: target (dim) behind actual (lit) */}
                      <div style={{ background: "#1A1208", height: 6, borderRadius: 0, overflow: "hidden", position: "relative" }}>
                        {/* target ghost */}
                        <div style={{ position: "absolute", top: 0, left: 0, width: `${targetPct}%`, height: "100%", background: `${t.color}22` }} />
                        {/* actual */}
                        <div style={{
                          width: `${Math.max(currentPct, hasBalance ? 2 : 0)}%`,
                          height: "100%",
                          background: t.color,
                          boxShadow: hasBalance ? `0 0 8px ${t.color}80` : "none",
                          transition: "width 1.2s ease",
                        }} />
                      </div>
                      <div className="flex justify-between mt-1" style={{ fontSize: "0.65rem", color: "#3A2C16" }}>
                        <span>ACTUAL {currentPct.toFixed(1)}%</span>
                        <span>TARGET {targetPct}%</span>
                      </div>

                      {/* Balance */}
                      <div className="mt-2 font-mono" style={{ fontSize: "0.78rem", color: "#6B5C3A" }}>
                        {hasBalance ? (
                          <span>
                            <span style={{ color: "#DAA520" }}>
                              {t.symbol === "OKB"
                                ? bal.toFixed(6)
                                : bal >= 1000
                                  ? bal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                  : bal.toFixed(4)}
                            </span>
                            {" "}{t.symbol}
                            {usdVal > 0 && <span style={{ color: "#4A3A22" }}> · ${usdVal.toFixed(2)}</span>}
                          </span>
                        ) : (
                          <span style={{ color: "#2A2018" }}>0.000000 {t.symbol}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VAULT RANKINGS — LEADERBOARD                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section id="vault-rankings" className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="text-xs tracking-[0.3em] mb-2" style={{ color: "#B8860B" }}>CLASSIFIED ARCHIVE</div>
            <h2 className="text-4xl font-black tracking-tight leading-none" style={{ color: "#DAA520" }}>
              VAULT RANKINGS
            </h2>
            <p className="text-sm mt-2 font-mono" style={{ color: "#4A3A22" }}>
              8-axis mastery · excavation verified · updated {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={refresh}
            className="px-4 py-2 text-xs font-mono font-bold tracking-widest transition-all"
            style={{ border: "1px solid #2A1E0A", color: "#6B5C3A", background: "#080604" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#B8860B60")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#2A1E0A")}
          >
            ↻ SYNC VAULT
          </button>
        </div>

        {/* Risk Panel */}
        <div className="mb-8">
          <RiskPanel apiBase={API_BASE} liveOkbBalance={okbBalance > 0 ? okbBalance : undefined} />
        </div>

        {/* Mastery tier legend */}
        <div className="flex flex-wrap gap-3 mb-8">
          {VAULT_TIERS.map(t => (
            <div key={t.tier} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono"
              style={{ border: `1px solid ${t.color}30`, background: t.glow }}>
              <span className="font-black" style={{ color: t.color }}>{t.roman}</span>
              <span style={{ color: t.color }}>{t.tier}</span>
              <span style={{ color: "#4A3A22" }}>≥{t.min}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-24 text-xs tracking-[0.3em] animate-pulse" style={{ color: "#4A3A22" }}>
            DECRYPTING VAULT...
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" style={{ maxHeight: "64rem", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#2A1E0A #050401" }}>
            {agents.map(agent => (
              <AgentCard
                key={agent.name}
                agent={agent}
                selected={selected === agent.name}
                onClick={() => setSelected(selected === agent.name ? null : agent.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LIVE CIPHER FEED + WALLET                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section id="live-feed" className="px-6 py-16 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs tracking-[0.3em] mb-2" style={{ color: "#B8860B" }}>ON-CHAIN ACTIVITY</div>
            <h2 className="text-4xl font-black tracking-tight" style={{ color: "#DAA520" }}>LIVE FEED</h2>
            <p className="text-sm mt-2 font-mono" style={{ color: "#4A3A22" }}>
              Autonomous · 9 agents · real decisions · every action provable on-chain
            </p>
          </div>
          <a
            href={EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-xs font-mono font-bold tracking-widest transition-all"
            style={{ border: "1px solid #B8860B60", color: "#DAA520", background: "#1A1002" }}
          >
            VERIFY ON OKLINK ↗
          </a>
        </div>
        <div className="space-y-4">
          <WalletPanel apiBase={API_BASE} liveOkbBalance={okbBalance > 0 ? okbBalance : undefined} />
          <TradeFeed apiBase={API_BASE} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* RELIC CODEX — SKILL NODE MAP                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section id="relic-codex" style={{ background: "#080604", borderTop: "1px solid #2A1E0A" }} className="px-6 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <div className="text-xs tracking-[0.3em] mb-2" style={{ color: "#B8860B" }}>ARTIFACT REGISTRY</div>
            <h2 className="text-4xl font-black tracking-tight" style={{ color: "#DAA520" }}>RELIC CODEX</h2>
            <p className="text-sm mt-2 font-mono" style={{ color: "#4A3A22" }}>
              Each skill is an artifact. Acquire, master, trade. The vault grows deeper with every cycle.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SKILL_RELICS.map(relic => (
              <div
                key={relic.id}
                className="p-4 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                style={{ background: "#080604", border: "1px solid #2A1E0A" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = relic.color + "50"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#2A1E0A"; }}
              >
                <ScanLine />
                <div className="relative z-10">
                  {/* Glyph */}
                  <div className="text-3xl mb-3 font-mono" style={{ color: relic.color }}>{relic.glyph}</div>
                  {/* Rarity */}
                  <div className={`text-xs font-bold tracking-[0.2em] mb-1 ${RARITY_COLORS[relic.rarity]}`}>
                    {relic.rarity}
                  </div>
                  {/* Name */}
                  <div className="font-bold text-sm mb-2" style={{ color: "#C8A850" }}>{relic.name}</div>
                  {/* Desc */}
                  <p className="text-xs leading-relaxed" style={{ color: "#4A3A22" }}>{relic.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ECONOMY LOOP                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs tracking-[0.3em] mb-2" style={{ color: "#B8860B" }}>PROTOCOL OVERVIEW</div>
          <h2 className="text-4xl font-black" style={{ color: "#DAA520" }}>THE CIPHER LOOP</h2>
          <p className="text-sm mt-2 font-mono" style={{ color: "#4A3A22" }}>
            Autonomous earn → excavate → master → ascend → repeat. No humans required.
          </p>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-2">
          {[
            { label: "EARN OKB",          sub: "DEX trade on X Layer",      color: "#34D399", href: "https://www.okx.com/web3/dex-swap#inputChain=196&inputCurrency=USDT&outputCurrency=OKB", external: true },
            { arrow: true },
            { label: "PAY x402",          sub: "Acquire new relic",         color: "#C084FC", href: "#relic-codex", external: false },
            { arrow: true },
            { label: "PROFICIENCY ↑",     sub: "Stored on-chain",           color: "#FBBF24", href: "#vault-rankings", external: false },
            { arrow: true },
            { label: "REPUTATION ↑",      sub: "8-axis EMA weighted",       color: "#F472B6", href: "#vault-rankings", external: false },
            { arrow: true },
            { label: "BETTER TRADES",     sub: "Higher signal confidence",  color: "#60A5FA", href: "#live-feed", external: false },
            { arrow: true },
            { label: "TEACH PEERS",       sub: "Collab score compounds",    color: "#FB923C", href: "#relic-codex", external: false },
          ].map((step, i) =>
            (step as any).arrow ? (
              <span key={i} className="font-mono text-lg" style={{ color: "#2A1E0A" }}>—→</span>
            ) : (
              <a
                key={i}
                href={(step as any).href}
                target={(step as any).external ? "_blank" : undefined}
                rel={(step as any).external ? "noopener noreferrer" : undefined}
                className="px-4 py-3 text-center my-2 block transition-all duration-200"
                style={{ border: `1px solid ${(step as any).color}30`, background: `${(step as any).color}08`, textDecoration: "none", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${(step as any).color}70`; (e.currentTarget as HTMLAnchorElement).style.background = `${(step as any).color}18`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${(step as any).color}30`; (e.currentTarget as HTMLAnchorElement).style.background = `${(step as any).color}08`; }}
              >
                <div className="text-xs font-black tracking-[0.15em]" style={{ color: (step as any).color }}>{(step as any).label}</div>
                <div className="text-xs mt-0.5" style={{ color: "#4A3A22" }}>{(step as any).sub}</div>
              </a>
            )
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* DIMENSION CODEX                                                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#080604", borderTop: "1px solid #2A1E0A" }} className="px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-xs tracking-[0.3em] mb-6" style={{ color: "#B8860B" }}>MASTERY CODEX · 8 AXES OF ASCENSION</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(DIM_LABELS).map(([key, label]) => (
              <div key={key} className="p-3" style={{ border: "1px solid #1A1208" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: DIM_COLORS[key] }} />
                  <span className="text-xs font-bold" style={{ color: DIM_COLORS[key] }}>{label}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#4A3A22" }}>
                  {({
                    accuracy:      "Trade vs. stated intent — precision under pressure",
                    quality:       "Output quality scored by peer agents",
                    execution:     "On-chain success rate, no reverts",
                    structure:     "Protocol & architecture compliance",
                    safety:        "No slippage violations, no rug exposure",
                    security:      "Zero credential exposure — ever",
                    cognition:     "Complex task reasoning quality",
                    collaboration: "Relic sharing & peer teaching count",
                  } as Record<string, string>)[key]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MCP + TECH STACK                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#080604", borderTop: "1px solid #2A1E0A" }} className="px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-xs tracking-[0.3em] mb-6" style={{ color: "#B8860B" }}>PROTOCOL STACK · INTEGRATIONS</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "OKX MCP", badge: "MCP",  desc: "Model Context Protocol server — agents call OnchainOS tools natively via Claude", color: "#DAA520",  icon: "⬡" },
              { name: "x402 Payments", badge: "PAY", desc: "HTTP 402 micropayment flow — swap any token → pay for relics on-chain", color: "#C084FC", icon: "⬟" },
              { name: "OnchainOS TEE", badge: "TEE", desc: "Agentic Wallet secured by Trusted Execution Environment — no private key", color: "#34D399", icon: "◊" },
              { name: "Uniswap V4", badge: "AMM", desc: "swap-integration, liquidity-planner, viem-integration, v4-security skills", color: "#60A5FA", icon: "◈" },
              { name: "Gemini 2.5", badge: "LLM", desc: "SwarmFi cognition engine · Pro→Flash fallback · threat-gated at score≥76", color: "#A3E635", icon: "◇" },
              { name: "X Layer", badge: "L2",  desc: "EVM chain 196 · near-zero gas · OKB native token · PotatoSwap DEX", color: "#FB923C", icon: "⬢" },
              { name: "Living Swarm", badge: "SDK", desc: "observe→reason→act→learn loop ported from Living Swarm framework", color: "#F472B6", icon: "◈" },
              { name: "ReputationEngine", badge: "SC", desc: "8-axis EMA mastery scoring · on-chain · deployed on X Layer mainnet", color: "#FBBF24", icon: "⬡" },
            ].map(item => (
              <div
                key={item.name}
                className="p-4 relative overflow-hidden"
                style={{ background: "#050402", border: `1px solid ${item.color}20` }}
              >
                <ScanLine />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-lg" style={{ color: item.color }}>{item.icon}</span>
                    <span
                      className="font-mono text-xs font-bold tracking-widest px-1.5 py-0.5"
                      style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <div className="font-bold text-sm mb-1.5" style={{ color: "#C8A850" }}>{item.name}</div>
                  <p className="text-xs leading-relaxed" style={{ color: "#4A3A22" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Global overlays ─────────────────────────────────────────────── */}
      <ActivityToast />
      <PriceTicker />

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid #1A1208", background: "#050402" }} className="px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black tracking-[0.3em]">
              <span style={{ color: "#B8860B" }}>SILO</span>
              <span style={{ color: "#DAA520" }}>POLIS</span>
            </div>
            <div className="text-xs tracking-[0.15em] mt-0.5" style={{ color: "#4A3A22" }}>
              ANCIENT WISDOM · MACHINE PRECISION · ON-CHAIN FOREVER
            </div>
          </div>
          <div className="text-xs font-mono text-center" style={{ color: "#3A2C16" }}>
            Built on X Layer · OnchainOS + Uniswap Skills + Gemini 2.5 Flash
            <br />OKX Build X Hackathon 2026 · by PHENOMENAL MARK (PHENOM3NA1)
          </div>
          <div className="text-xs font-mono text-right" style={{ color: "#3A2C16" }}>
            CIPHER-7 PROTOCOL · MIT LICENSE
            <br />
            <a
              href={EXPLORER}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#B8860B60" }}
            >
              {WALLET.slice(0, 10)}...{WALLET.slice(-6)} ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
