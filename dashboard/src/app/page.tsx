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

const HeartbeatTimer = dynamic(() => import("../components/HeartbeatTimer"), { ssr: false });

const ParticleArena = dynamic(() => import("../components/ParticleArena"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const FETCH_HEADERS: HeadersInit = { "Bypass-Tunnel-Reminder": "true" };

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

function RiskPanel({ apiBase }: { apiBase: string }) {
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

  // OKB floor health — how far above floor the balance is
  const floorPct = Math.min(100, (risk.okb_balance / OKB_BUFFER) * 100);
  const floorColor = risk.okb_balance < OKB_FLOOR ? "#F87171" : risk.okb_balance < OKB_BUFFER ? "#FBBF24" : "#34D399";

  // Portfolio management feed bars (0–100 derived scores)
  const logicScore   = Math.max(0, Math.min(100, 80 - risk.consecutive_losses * 25 + (risk.win_rate_pct > 50 ? 20 : 0)));
  const knowledgeScore = Math.min(100, (knowledgeCount / 40) * 100);
  const implScore    = risk.total_trades > 0 ? Math.min(100, ((risk.winning_trades ?? 0) / risk.total_trades) * 100 + 10) : 10;
  const improvScore  = Math.min(100, risk.win_rate_pct + (cycleCount * 2));

  // Multi-coin basket allocation targets (MICRO tier: max OKB accumulation)
  const basket = [
    { symbol: "OKB",  pct: 70, color: "#DAA520", desc: "Core accumulation target" },
    { symbol: "USDT", pct: 22, color: "#34D399", desc: "Stable buyback reserve" },
    { symbol: "USDC", pct: 8,  color: "#60A5FA", desc: "Arb buffer" },
  ];

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
              {risk.okb_balance.toFixed(6)}
            </div>
            <div className="text-xs font-mono" style={{ color: "#4A3A22" }}>OKB VAULT</div>
          </div>
        </div>
        <p className="text-xs mb-4" style={{ color: "#4A3A22" }}>{risk.description}</p>

        {/* OKB Floor threshold indicator */}
        <div className="mb-2">
          <div className="flex justify-between text-xs font-mono mb-1">
            <span style={{ color: floorColor }}>OKB FLOOR GUARD</span>
            <span style={{ color: floorColor }}>
              {risk.okb_balance.toFixed(6)} / {OKB_BUFFER.toFixed(6)} OKB
              {risk.okb_balance < OKB_FLOOR ? " ⚠ BELOW FLOOR" : risk.okb_balance < OKB_BUFFER ? " ↑ BUYING" : " ✓ SAFE"}
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
const EXPLORER = `https://www.oklink.com/xlayer/address/${WALLET}`;

function WalletPanel({ apiBase }: { apiBase: string }) {
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
                <div className="text-2xl font-black font-mono" style={{ color: tc }}>{risk.okb_balance.toFixed(6)}</div>
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

// ─── Trade History Graph Feed ─────────────────────────────────────────────────

type FeedRow = { time: string; action: string; agent: string; detail: string; color: string; icon: string };

function actionColor(action: string): { color: string; icon: string } {
  const map: Record<string, { color: string; icon: string }> = {
    SWAP:    { color: "#DAA520", icon: "⬡" },
    QUOTE:   { color: "#FB923C", icon: "◈" },
    OBSERVE: { color: "#60A5FA", icon: "◈" },
    LEARN:   { color: "#C084FC", icon: "◇" },
    WAIT:    { color: "#4A3A22", icon: "·" },
    HOLD:    { color: "#FBBF24", icon: "◊" },
    ERR:     { color: "#F87171", icon: "✕" },
  };
  return map[action] ?? { color: "#6B5C3A", icon: "○" };
}

function TradeFeed({ apiBase }: { apiBase: string }) {
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [hbHistory, setHbHistory] = useState<Array<{ id: string; started_at: string; agents_run: number; actions_taken: number; elapsed_sec: number }>>([]);

  useEffect(() => {
    const loadFeed = async () => {
      try {
        const r = await fetch(`${apiBase}/api/feed?limit=12`, { headers: FETCH_HEADERS });
        if (r.ok) {
          const data = await r.json();
          if (data.feed && data.feed.length > 0) {
            const rows: FeedRow[] = data.feed.map((item: { ts: string; agent: string; action: string; confidence: number; reasoning: string; okb_price: number; outcome: string }) => {
              const { color, icon } = actionColor(item.action);
              const ts = new Date(item.ts);
              const time = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
              const detail = item.reasoning
                ? `${item.reasoning} · conf ${item.confidence}`
                : `OKB $${data.okb_price?.toFixed(2)} · conf ${item.confidence}`;
              return { time, action: item.action, agent: item.agent, detail, color, icon };
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
    loadFeed();
    loadHb();
    const iv = setInterval(() => { loadFeed(); loadHb(); }, 30_000);
    return () => clearInterval(iv);
  }, [apiBase]);

  // ASCII-style sparkline from heartbeat history
  const sparkData = hbHistory.length > 0
    ? hbHistory.map(h => h.actions_taken ?? 0).reverse()
    : [0, 0, 1, 0, 0, 1, 0, 1, 2, 0, 1, 0];

  const maxSpark = Math.max(...sparkData, 1);
  const sparkCols = 24;
  const filledSpark = [...Array(Math.max(0, sparkCols - sparkData.length)).fill(0), ...sparkData.slice(-sparkCols)];

  return (
    <div className="p-5 relative overflow-hidden" style={{ background: "#080604", border: "1px solid #2A1E0A" }}>
      <ScanLine />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs tracking-[0.3em] mb-1" style={{ color: "#B8860B" }}>LIVE CIPHER FEED</div>
            <div className="text-xs font-mono" style={{ color: "#4A3A22" }}>
              Every 2h · observe → reason → act → learn → repeat
            </div>
          </div>
          {/* Sparkline */}
          <div className="flex items-end gap-px h-8">
            {filledSpark.map((v, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: `${Math.max(4, (v / maxSpark) * 32)}px`,
                  background: v > 0 ? "#DAA520" : "#1A1208",
                  opacity: 0.4 + (i / sparkCols) * 0.6,
                }}
              />
            ))}
          </div>
        </div>

        {/* Feed rows */}
        <div className="space-y-2">
          {feed.map((row, i) => (
            <div key={i} className="flex items-start gap-3 py-2" style={{ borderBottom: "1px solid #0F0C08" }}>
              <span className="font-mono text-xs flex-shrink-0 w-12" style={{ color: "#3A2C16" }}>{row.time}</span>
              <span className="font-mono text-xs flex-shrink-0" style={{ color: row.color }}>{row.icon}</span>
              <span
                className="font-mono text-xs flex-shrink-0 px-1.5 py-0.5 tracking-wider"
                style={{ background: `${row.color}15`, color: row.color, border: `1px solid ${row.color}30` }}
              >
                {row.action}
              </span>
              <span className="font-mono text-xs flex-shrink-0 hidden sm:inline" style={{ color: "#4A3A22" }}>{row.agent}</span>
              <span className="font-mono text-xs flex-1 truncate" style={{ color: "#6B5C3A" }}>{row.detail}</span>
            </div>
          ))}
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

  const DEMO_AGENTS: Agent[] = [
    { rank: 1, name: "SILO-CIPHER-01",  type: "excavator",   composite: 720, skills: 6, tx_count: 34,
      dimensions: { accuracy: 780, quality: 730, execution: 760, structure: 710, safety: 690, security: 720, cognition: 700, collaboration: 740, composite: 720 } },
    { rank: 2, name: "SILO-ORACLE-02",  type: "analyst",     composite: 640, skills: 5, tx_count: 21,
      dimensions: { accuracy: 680, quality: 650, execution: 700, structure: 610, safety: 590, security: 630, cognition: 700, collaboration: 600, composite: 640 } },
    { rank: 3, name: "SILO-HUNTER-03",  type: "trader",      composite: 580, skills: 4, tx_count: 48,
      dimensions: { accuracy: 600, quality: 560, execution: 640, structure: 570, safety: 550, security: 580, cognition: 530, collaboration: 570, composite: 580 } },
    { rank: 4, name: "SILO-ARBITER-04", type: "arbiter",     composite: 530, skills: 3, tx_count: 15,
      dimensions: { accuracy: 510, quality: 520, execution: 560, structure: 550, safety: 620, security: 640, cognition: 480, collaboration: 440, composite: 530 } },
    { rank: 5, name: "SILO-SCRIBE-05",  type: "scribe",      composite: 475, skills: 4, tx_count: 27,
      dimensions: { accuracy: 460, quality: 490, execution: 450, structure: 510, safety: 480, security: 460, cognition: 490, collaboration: 500, composite: 475 } },
    { rank: 6, name: "SILO-NOVICE-06",  type: "initiate",    composite: 310, skills: 2, tx_count: 9,
      dimensions: { accuracy: 300, quality: 320, execution: 290, structure: 340, safety: 310, security: 320, cognition: 300, collaboration: 310, composite: 310 } },
  ];

  const refresh = useCallback(async () => {
    try {
      const opts = { headers: FETCH_HEADERS };
      const [lb, st] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`, opts).then(r => r.json()),
        fetch(`${API_BASE}/api/status`, opts).then(r => r.json()),
      ]);
      const list: Agent[] = lb.leaderboard ?? DEMO_AGENTS;
      setAgents(list);
      setStatus(st);
      setTotalTx(list.reduce((s, a) => s + a.tx_count, 0));
    } catch {
      setAgents(DEMO_AGENTS);
      setTotalTx(DEMO_AGENTS.reduce((s, a) => s + a.tx_count, 0));
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    refresh();
    // Classified flicker on mount
    setTimeout(() => setClassified(true), 300);
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  const triggerCycle = async () => {
    if (cycleRunning) return;
    setCycleRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/cycle`, {
        method: "POST",
        headers: { ...FETCH_HEADERS, "Content-Type": "application/json" },
      });
      if (!resp.ok) console.warn("Cycle trigger failed:", resp.status, await resp.text());
      setTimeout(refresh, 8000); // wait 8s for heartbeat to start, then refresh leaderboard
    } catch (e) {
      console.error("Cycle trigger error:", e);
    } finally {
      setCycleRunning(false);
    }
  };

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: "#050402", fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>

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
        @keyframes scandown {
          from { transform: translateY(-100%) } to { transform: translateY(100vh) }
        }
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
              <HeartbeatTimer apiBase={API_BASE} cycleIntervalSec={3600} />

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
      {/* STATS STRIP                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#080604", borderTop: "1px solid #2A1E0A", borderBottom: "1px solid #2A1E0A" }}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "HUNTERS ACTIVE",    val: status?.agent_count ?? agents.length, suffix: "",   accent: true  },
              { label: "CYCLES COMPLETED",  val: status?.cycle_count ?? 0,             suffix: "",   accent: false },
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
      {/* VAULT RANKINGS — LEADERBOARD                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-6 py-16">
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
          <RiskPanel apiBase={API_BASE} />
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs tracking-[0.3em] mb-2" style={{ color: "#B8860B" }}>ON-CHAIN ACTIVITY</div>
            <h2 className="text-4xl font-black tracking-tight" style={{ color: "#DAA520" }}>LIVE FEED</h2>
            <p className="text-sm mt-2 font-mono" style={{ color: "#4A3A22" }}>
              Every cycle captured · 12 heartbeats/day · immutable audit trail
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
          <WalletPanel apiBase={API_BASE} />
          <TradeFeed apiBase={API_BASE} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* RELIC CODEX — SKILL NODE MAP                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "#080604", borderTop: "1px solid #2A1E0A" }} className="px-6 py-16">
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
            { label: "EARN OKB",          sub: "DEX trade on X Layer",      color: "#34D399" },
            { arrow: true },
            { label: "PAY x402",          sub: "Acquire new relic",         color: "#C084FC" },
            { arrow: true },
            { label: "PROFICIENCY ↑",     sub: "Stored on-chain",           color: "#FBBF24" },
            { arrow: true },
            { label: "REPUTATION ↑",      sub: "8-axis EMA weighted",       color: "#F472B6" },
            { arrow: true },
            { label: "BETTER TRADES",     sub: "Higher signal confidence",  color: "#60A5FA" },
            { arrow: true },
            { label: "TEACH PEERS",       sub: "Collab score compounds",    color: "#FB923C" },
          ].map((step, i) =>
            (step as any).arrow ? (
              <span key={i} className="font-mono text-lg" style={{ color: "#2A1E0A" }}>—→</span>
            ) : (
              <div key={i} className="px-4 py-3 text-center my-2"
                style={{ border: `1px solid ${(step as any).color}30`, background: `${(step as any).color}08` }}>
                <div className="text-xs font-black tracking-[0.15em]" style={{ color: (step as any).color }}>{(step as any).label}</div>
                <div className="text-xs mt-0.5" style={{ color: "#4A3A22" }}>{(step as any).sub}</div>
              </div>
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
