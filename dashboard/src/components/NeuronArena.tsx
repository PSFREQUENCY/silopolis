"use client";

/**
 * SILOPOLIS — Neural Terrain
 * Background mesh maps every live TX as a holographic neon particle node.
 * Hover → water-flow; click TX node → agent path explosion → OKLink.
 * Timeline prop filters visible TX nodes (timeline slider from page.tsx).
 */

import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const FETCH_HEADERS: HeadersInit = { "Bypass-Tunnel-Reminder": "true" };

// ── Exported types ─────────────────────────────────────────────────────────────

export interface TxHistoryItem {
  ts: string;
  agent: string;
  action: string;
  tx_hash?: string;   // undefined for simulated/queued actions
  color: string;
  is_x402: boolean;
}

export interface NeuronArenaProps {
  txHistory?: TxHistoryItem[];
  timelineIdx?: number;
}

interface FeedItem {
  ts: string;
  agent: string;
  action: string;
  reasoning: string;
  confidence: number;
  tx_hash?: string | null;
}

// ── Neural node map ───────────────────────────────────────────────────────────

const NODES = [
  { id: "in1",  label: "SIGNAL DETECT",  glyph: "◈", color: "#00f0ff", rgb: "0,240,255",    xp: 0.12, yp: 0.28 },
  { id: "in2",  label: "MARKET SCAN",    glyph: "◇", color: "#22d3ee", rgb: "34,211,238",   xp: 0.88, yp: 0.27 },
  { id: "in3",  label: "WHALE WATCH",    glyph: "⬡", color: "#38BDF8", rgb: "56,189,248",   xp: 0.50, yp: 0.09 },
  { id: "sk1",  label: "PATTERN ENGINE", glyph: "◊", color: "#7c3aed", rgb: "124,58,237",   xp: 0.26, yp: 0.55 },
  { id: "sk2",  label: "RISK ARBITER",   glyph: "⬟", color: "#9333ea", rgb: "147,51,234",   xp: 0.74, yp: 0.55 },
  { id: "core", label: "COGNITION CORE", glyph: "⬢", color: "#DAA520", rgb: "218,165,32",   xp: 0.50, yp: 0.50 },
  { id: "out1", label: "TRADE ENGINE",   glyph: "⬡", color: "#22c55e", rgb: "34,197,94",    xp: 0.28, yp: 0.82 },
  { id: "out2", label: "LEARNER",        glyph: "◈", color: "#ec4899", rgb: "236,72,153",   xp: 0.72, yp: 0.82 },
];

const EDGES: [string, string][] = [
  ["in1",  "sk1"], ["in2",  "sk2"],
  ["in3",  "sk1"], ["in3",  "sk2"],
  ["sk1",  "core"], ["sk2", "core"],
  ["core", "out1"], ["core","out2"],
  ["out1", "out2"],
];

// ── Reasoning chains ──────────────────────────────────────────────────────────

const CHAINS = [
  {
    path: ["in1", "sk1", "core", "out1"],
    color: "#00f0ff",
    steps: [
      { label: "SIGNAL DETECTED",  detail: "AI Agent token · Base chain · 24h old",              extra: "social velocity +340%" },
      { label: "PATTERN MATCH",    detail: "sub-$500K mcap · locked liq · 3 alpha wallets",       extra: "conviction score building" },
      { label: "KNOWLEDGE LINKED", detail: "Base+AI narrative → 3:1 historical outperform",       extra: "72% win rate on pattern" },
      { label: "TRADE SIGNAL",     detail: "SWRMX · Entry $0.00042 · Stop -35%",                  extra: "Conviction 91/100 ◈" },
    ],
  },
  {
    path: ["in2", "sk2", "core", "out1"],
    color: "#22d3ee",
    steps: [
      { label: "WHALE ALERT",      detail: "0x7a3F loaded $120K NEURAL · 5h ago",                 extra: "Alpha Whale #1 wallet" },
      { label: "RISK CLEARED",     detail: "Honeypot PASS · Contract CLEAN · liq $340K",          extra: "buy tax 2% · age 72h" },
      { label: "KNOWLEDGE LINKED", detail: "Whale cluster: 3 known alpha wallets aligned",        extra: "68% accuracy on this pattern" },
      { label: "TRADE SIGNAL",     detail: "NEURAL · Entry $0.0015 · Stop -35%",                  extra: "Conviction 87/100 ◈" },
    ],
  },
  {
    path: ["in3", "sk1", "core", "out2"],
    color: "#38BDF8",
    steps: [
      { label: "TREND LAG FOUND",  detail: "Google Trends 52h behind X/Twitter",                  extra: "pre-breakout accumulation" },
      { label: "PATTERN MATCH",    detail: "48h+ lag → 10x potential · historical 68%",            extra: "Intent Protocol narrative" },
      { label: "KNOWLEDGE LINKED", detail: "VC wallet $200K INTNT · ETH chain · FIRE heat 91",    extra: "narrative peak incoming" },
      { label: "LEARNER UPDATED",  detail: "New win pattern: trend lag > 48h = 10x",              extra: "win rate recalibrated 73%" },
    ],
  },
  {
    path: ["in2", "sk2", "core", "out1"],
    color: "#7c3aed",
    steps: [
      { label: "RESTAKE SIGNAL",   detail: "zkProof Labs · first-mover on Base · 48h old",        extra: "Google Trends: no coverage" },
      { label: "RISK CLEARED",     detail: "Token Sniffer CLEAN · locked 6mo · buy tax 2%",       extra: "dev wallet: prior successes" },
      { label: "KNOWLEDGE LINKED", detail: "zkProofs narrative 82/100 heat · rising fast",        extra: "institutional mentions up 5x" },
      { label: "TRADE SIGNAL",     detail: "ZKPRF · Entry $0.056 · Stop -35%",                    extra: "Conviction 82/100 ◈" },
    ],
  },
];

// ── Micro-particle colors (neon palette) ──────────────────────────────────────

const MICRO_COLORS = [
  "0,240,255",   // cyan
  "139,92,246",  // violet
  "218,165,32",  // gold
  "34,197,94",   // green
  "236,72,153",  // pink
  "56,189,248",  // sky
  "168,85,247",  // purple
  "255,255,255", // white
];

// ── Types ─────────────────────────────────────────────────────────────────────

type BezierCurve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };
type BezierMap   = Record<string, BezierCurve>;
type NodeMap     = Record<string, { x: number; y: number }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function rng(a: number, b: number) { return a + Math.random() * (b - a); }

function bezierMid(ax: number, ay: number, bx: number, by: number) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const nx = -(by - ay), ny = bx - ax;
  const len = Math.sqrt(nx * nx + ny * ny) + 0.001;
  const bend = rng(0.12, 0.22) * (Math.random() > 0.5 ? 1 : -1);
  return { cx: mx + (nx / len) * len * bend, cy: my + (ny / len) * len * bend };
}

function bezierPoint(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * ax + 2 * mt * t * cx + t * t * bx,
    y: mt * mt * ay + 2 * mt * t * cy + t * t * by,
  };
}

// ── Agent → neural path mapping ───────────────────────────────────────────────

const AGENT_PATH: Record<string, { path: string[]; color: string }> = {
  "SILO-TRADER-1":    { path: ["in1", "sk1", "core", "out1"], color: "#22c55e" },
  "SILO-ANALYST-2":   { path: ["in2", "sk2", "core", "out1"], color: "#22d3ee" },
  "SILO-SKILL-3":     { path: ["in3", "sk1", "core", "out2"], color: "#7c3aed" },
  "SILO-GUARD-4":     { path: ["in2", "sk2", "core", "out2"], color: "#FBBF24" },
  "SILO-SCRIBE-5":    { path: ["in1", "sk1", "core", "out2"], color: "#ec4899" },
  "SILO-HUNTER-6":    { path: ["in1", "sk1", "core", "out1"], color: "#00f0ff" },
  "SILO-ORACLE-7":    { path: ["in3", "sk2", "core", "out1"], color: "#38BDF8" },
  "SILO-SUSTAINER-8": { path: ["in2", "sk1", "core", "out2"], color: "#a78bfa" },
  "SILO-SENTRY-9":    { path: ["in1", "sk2", "core", "out2"], color: "#FB923C" },
};

const ACTION_STEP_LABELS: Record<string, string[]> = {
  SWAP:        ["SIGNAL DETECTED",  "PATTERN CONFIRMED", "KNOWLEDGE APPLIED", "SWAP EXECUTED"],
  HUNTING:     ["SCANNING TARGET",  "RISK CLEARED",      "CONVICTION BUILT",  "HUNT ACTIVE"],
  SCANNING:    ["SIGNAL DETECTED",  "PATTERN BUILDING",  "KNOWLEDGE LINKED",  "SIGNAL QUEUED"],
  ANALYZING:   ["DATA INGESTED",    "PATTERN MATCHED",   "KNOWLEDGE LINKED",  "ANALYSIS COMPLETE"],
  FORECASTING: ["SIGNAL INGESTED",  "MODEL UPDATED",     "FORECAST ISSUED",   "ORACLE ACTIVE"],
  ARCHIVING:   ["CYCLE COMPLETE",   "PATTERN EXTRACTED", "KNOWLEDGE STORED",  "VAULT UPDATED"],
  DEPLOYING:   ["SKILL ACQUIRED",   "SYNC INITIATED",    "PEERS UPDATED",     "SKILL DEPLOYED"],
  GUARDING:    ["RISK DETECTED",    "ARBITER ENGAGED",   "POSITION PROTECTED","VAULT SECURED"],
  PATROLLING:  ["PERIMETER CHECK",  "THREAT SCAN",       "SIGNATURE CLEAR",   "SENTRY ACTIVE"],
  RESEARCHING: ["DATA SOURCED",     "PATTERN MINED",     "KNOWLEDGE BUILT",   "RESEARCH COMPLETE"],
  MONITORING:  ["FEED ACTIVE",      "METRICS CAPTURED",  "THRESHOLDS CHECKED","MONITOR ONLINE"],
};

// ── React component ───────────────────────────────────────────────────────────

interface ChainStep {
  label: string;
  detail: string;
  extra: string;
}

interface RenderedTxNode {
  x: number; y: number;
  color: string;
  tx_hash?: string;
  agent: string;
  action: string;
  txLink?: string;        // only set when real on-chain tx_hash exists
  is_x402: boolean;
  pulsePhase: number;
}

export default function NeuronArena({ txHistory, timelineIdx }: NeuronArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chainDisplay, setChainDisplay] = useState<{ steps: ChainStep[]; activeStep: number; color: string; txLink?: string; txHash?: string } | null>(null);
  const liveChainRef  = useRef<typeof CHAINS>([...CHAINS]);
  const pulseQueueRef = useRef<{ x: number; y: number; color: string; label: string }[]>([]);
  const lastFeedTsRef = useRef<string>("");
  const [recentTxs, setRecentTxs] = useState<{ agent: string; action: string; txLink: string; txHash: string; ts: string }[]>([]);
  const megaExplodeRef = useRef<{ color: string } | null>(null);

  // Refs for prop values (read in canvas render loop without re-running useEffect)
  const txHistoryRef  = useRef<TxHistoryItem[] | undefined>(txHistory);
  const timelineIdxRef = useRef<number | undefined>(timelineIdx);

  useEffect(() => {
    txHistoryRef.current  = txHistory;
    timelineIdxRef.current = timelineIdx;
  }, [txHistory, timelineIdx]);

  // TX node stable positions (keyed by tx_hash)
  const txPositionMapRef = useRef<Map<string, { xf: number; yf: number; pulsePhase: number }>>(new Map());
  // Current rendered tx nodes array (rebuilt each frame)
  const txMeshNodesRef = useRef<RenderedTxNode[]>([]);
  // Hovered tx node index
  const hoveredTxIdxRef = useRef<number | null>(null);
  // Mouse position in canvas space
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);

  const buildEdgeBeziers = useCallback((nodes: typeof NODES, W: number, H: number): { beziers: BezierMap; nodeMap: NodeMap } => {
    const beziers: BezierMap = {};
    const nodeMap: NodeMap   = {};
    nodes.forEach(n => { nodeMap[n.id] = { x: n.xp * W, y: n.yp * H }; });
    EDGES.forEach(([f, t]) => {
      const a = nodeMap[f], b = nodeMap[t];
      if (!a || !b) return;
      const mid = bezierMid(a.x, a.y, b.x, b.y);
      beziers[`${f}-${t}`] = { ax: a.x, ay: a.y, cx: mid.cx, cy: mid.cy, bx: b.x, by: b.y };
    });
    return { beziers, nodeMap };
  }, []);

  // ── Poll /api/feed ─────────────────────────────────────────────────────────
  useEffect(() => {
    const buildChainFromFeed = (item: FeedItem) => {
      const agentPath = AGENT_PATH[item.agent];
      if (!agentPath) return null;
      const stepLabels = ACTION_STEP_LABELS[item.action] ?? ACTION_STEP_LABELS["ANALYZING"];
      const shortAgent = item.agent.replace("SILO-", "");
      const reasoning = item.reasoning || `${item.action} cycle active`;
      return {
        path: agentPath.path,
        color: agentPath.color,
        steps: [
          { label: stepLabels[0], detail: `${shortAgent} · ${item.action}`,              extra: `cycle in progress` },
          { label: stepLabels[1], detail: reasoning.slice(0, 60),                         extra: `confidence ${item.confidence}%` },
          { label: stepLabels[2], detail: "Knowledge graph updated — swarm synced",       extra: "8-axis score recalibrated" },
          { label: stepLabels[3], detail: item.tx_hash ? `tx: ${item.tx_hash.slice(0,14)}…` : "output logged to vault", extra: `${shortAgent} ◈ complete` },
        ],
      };
    };

    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/feed?limit=9`, { headers: FETCH_HEADERS });
        if (!r.ok) return;
        const data = await r.json();
        const items: FeedItem[] = data.feed ?? [];
        if (!items.length) return;

        const liveChains = items.map(buildChainFromFeed).filter(Boolean) as typeof CHAINS;
        liveChainRef.current = liveChains.length >= 2
          ? [...liveChains, ...CHAINS.slice(0, 2)]
          : [...CHAINS];

        const txItems = items.filter(f => f.tx_hash && f.tx_hash !== "DRY_RUN" && f.tx_hash !== "");
        if (txItems.length > 0) {
          setRecentTxs(txItems.slice(0, 4).map(f => ({
            agent: f.agent.replace("SILO-", ""),
            action: f.action,
            txLink: `https://www.oklink.com/xlayer/tx/${f.tx_hash}`,
            txHash: f.tx_hash!,
            ts: f.ts,
          })));
        }

        const newest = items[0];
        if (newest && newest.ts !== lastFeedTsRef.current) {
          lastFeedTsRef.current = newest.ts;
          const agentPath = AGENT_PATH[newest.agent];
          if (agentPath) {
            const col = agentPath.color;
            const shortAgent = newest.agent.replace("SILO-", "");
            const txLink = newest.tx_hash && newest.tx_hash !== "DRY_RUN"
              ? `https://www.oklink.com/xlayer/tx/${newest.tx_hash}` : undefined;
            const txHash = newest.tx_hash && newest.tx_hash !== "DRY_RUN" ? newest.tx_hash : undefined;
            agentPath.path.forEach((nodeId, idx) => {
              setTimeout(() => {
                const node = NODES.find(n => n.id === nodeId);
                if (node) {
                  pulseQueueRef.current.push({
                    x: node.xp, y: node.yp, color: col,
                    label: idx === agentPath.path.length - 1 ? `${shortAgent} ◈ ${newest.action}` : "",
                  });
                }
              }, idx * 280);
            });
            setTimeout(() => {
              setChainDisplay(prev => prev ? { ...prev, txLink, txHash } : null);
            }, agentPath.path.length * 280 + 100);
          }
        }
      } catch {
        // keep static chains
      }
    };

    poll();
    const iv = setInterval(poll, 25_000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line

  // ── Canvas render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let running = true;
    let animId = 0;
    let W = 0, H = 0;
    let beziers: BezierMap = {};
    let nodeMap: NodeMap   = {};

    // ── Micro-particles ────────────────────────────────────────────────────────
    const MICRO_COUNT = 1800;
    interface Micro { x: number; y: number; vx: number; vy: number; colorIdx: number; alpha: number; alphaDir: number; size: number; phase: number; }
    const micros: Micro[] = [];

    function spawnMicro(): Micro {
      return {
        x: Math.random() * W, y: Math.random() * H,
        vx: rng(-0.18, 0.18), vy: rng(-0.18, 0.18),
        colorIdx: Math.floor(Math.random() * MICRO_COLORS.length),
        alpha: 0, alphaDir: 1, size: rng(0.4, 1.8), phase: Math.random() * Math.PI * 2,
      };
    }

    function initMicros() {
      micros.length = 0;
      for (let i = 0; i < MICRO_COUNT; i++) {
        const m = spawnMicro(); m.alpha = Math.random() * 0.25; micros.push(m);
      }
    }

    // ── Background mesh nodes ──────────────────────────────────────────────────
    const MESH_COUNT = 260;
    interface MeshNode { x: number; y: number; vx: number; vy: number; baseX: number; baseY: number; size: number; }
    const meshNodes: MeshNode[] = [];

    function spawnMeshNode(): MeshNode {
      const x = rng(0.02, 0.98) * W;
      const y = rng(0.02, 0.98) * H;
      return { x, y, vx: 0, vy: 0, baseX: x, baseY: y, size: rng(0.6, 1.6) };
    }

    function initMesh() {
      meshNodes.length = 0;
      for (let i = 0; i < MESH_COUNT; i++) meshNodes.push(spawnMeshNode());
    }

    // ── Cascade ────────────────────────────────────────────────────────────────
    interface CascadeTrail { x: number; y: number; alpha: number; size: number; }
    interface Cascade { chainIdx: number; pathStep: number; t: number; trail: CascadeTrail[]; color: string; completed: boolean; bursting: string | null; }
    let cascade: Cascade | null = null;
    let chainCursor = 0;
    let nextCascadeFrame = 120;

    // ── Shockwaves + bursts ────────────────────────────────────────────────────
    interface Shockwave { x: number; y: number; r: number; maxR: number; alpha: number; color: string; label: string; }
    const shockwaves: Shockwave[] = [];
    interface Burst { x: number; y: number; vx: number; vy: number; alpha: number; size: number; color: string; }
    const bursts: Burst[] = [];

    function spawnBurst(x: number, y: number, color: string, count = 30) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = rng(1, 4.5);
        bursts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, size: rng(1.5, 3.5), color });
      }
    }

    const nodeActivity: Record<string, number> = {};
    NODES.forEach(n => { nodeActivity[n.id] = 0; });

    // ── Resize ─────────────────────────────────────────────────────────────────
    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      W = canvas.width  = parent.clientWidth;
      H = canvas.height = parent.clientHeight;
      const built = buildEdgeBeziers(NODES, W, H);
      beziers = built.beziers;
      nodeMap = built.nodeMap;
      initMicros();
      initMesh();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    // ── Mouse events ───────────────────────────────────────────────────────────
    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current = {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top)  * (H / rect.height),
      };
    }
    function onMouseLeave() {
      mousePosRef.current = null;
      hoveredTxIdxRef.current = null;
      canvas.style.cursor = "default";
    }
    function onClick(e: MouseEvent) {
      const idx = hoveredTxIdxRef.current;
      if (idx !== null && idx < txMeshNodesRef.current.length) {
        const tn = txMeshNodesRef.current[idx];
        if (tn) {
          megaExplodeRef.current = { color: tn.color };
          // Only open OKLink if there is a real on-chain tx_hash
          if (tn.txLink) {
            setTimeout(() => window.open(tn.txLink, "_blank", "noopener"), 420);
          }
        }
      }
    }
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("click", onClick);

    // ── Main render loop ───────────────────────────────────────────────────────
    let frame = 0;

    const render = () => {
      if (!running) return;
      const ctx = canvas.getContext("2d")!;
      frame++;

      // ── Mega-explode ─────────────────────────────────────────────────────────
      if (megaExplodeRef.current) {
        const { color } = megaExplodeRef.current;
        megaExplodeRef.current = null;
        NODES.forEach(n => {
          const nx = n.xp * W, ny = n.yp * H;
          spawnBurst(nx, ny, n.color, 45);
          shockwaves.push({ x: nx, y: ny, r: 6, maxR: 120, alpha: 1.2, color: n.color, label: "" });
        });
        const cx = W / 2, cy = H / 2;
        micros.forEach(m => {
          const dx = m.x - cx, dy = m.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          m.vx += (dx / dist) * 7; m.vy += (dy / dist) * 7;
        });
        spawnBurst(cx, cy, color, 80);
      }

      // ── Process pulse queue ──────────────────────────────────────────────────
      while (pulseQueueRef.current.length > 0) {
        const p = pulseQueueRef.current.shift()!;
        const px = p.x * W, py = p.y * H;
        shockwaves.push({ x: px, y: py, r: 8, maxR: 90, alpha: 1, color: p.color, label: p.label });
        micros.forEach(m => {
          const dx = m.x - px, dy = m.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const force = Math.max(0, 1 - dist / 180) * 4.0;
          m.vx += (dx / dist) * force; m.vy += (dy / dist) * force;
        });
        spawnBurst(px, py, p.color, p.label ? 60 : 25);
      }

      // Background
      ctx.fillStyle = "rgba(5, 4, 2, 0.88)";
      ctx.fillRect(0, 0, W, H);

      const cg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.65);
      cg.addColorStop(0, "rgba(0,240,255,0.018)");
      cg.addColorStop(0.4, "rgba(139,92,246,0.012)");
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);

      // ─────────────────────────────────────────────────────────────────────────
      // LAYER 0 — BACKGROUND MESH (behind everything)
      // ─────────────────────────────────────────────────────────────────────────

      const MESH_CONNECT_DIST = Math.min(W, H) * 0.13;
      const mp = mousePosRef.current;

      // Update mesh node physics
      meshNodes.forEach(m => {
        // Spring return to base
        m.vx += (m.baseX - m.x) * 0.003;
        m.vy += (m.baseY - m.y) * 0.003;
        // Mouse attraction — nodes flow toward cursor
        if (mp) {
          const dx = mp.x - m.x, dy = mp.y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200 && dist > 0) {
            const force = (1 - dist / 200) * 4.2;
            m.vx += (dx / dist) * force;
            m.vy += (dy / dist) * force;
          }
        }
        // Dampen
        m.vx *= 0.87;
        m.vy *= 0.87;
        m.x += m.vx;
        m.y += m.vy;
        // Clamp
        m.x = Math.max(0, Math.min(W, m.x));
        m.y = Math.max(0, Math.min(H, m.y));
      });

      // Draw mesh edges
      ctx.lineWidth = 0.3;
      for (let i = 0; i < meshNodes.length; i++) {
        const a = meshNodes[i];
        for (let j = i + 1; j < meshNodes.length; j++) {
          const b = meshNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < MESH_CONNECT_DIST * MESH_CONNECT_DIST) {
            const dist = Math.sqrt(dist2);
            const alpha = (1 - dist / MESH_CONNECT_DIST) * 0.07;
            ctx.strokeStyle = `rgba(180,134,11,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw mesh nodes (tiny dim dots)
      meshNodes.forEach(m => {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "rgba(180,134,11,1)";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // ── Rebuild TX mesh nodes from prop ──────────────────────────────────────
      const histItems = txHistoryRef.current ?? [];
      const maxIdx = timelineIdxRef.current !== undefined ? timelineIdxRef.current : histItems.length - 1;
      const visibleItems = histItems.slice(0, maxIdx + 1);

      // Assign stable random positions — use ts+agent as key so undefined tx_hash doesn't collide
      visibleItems.forEach(tx => {
        const stableKey = tx.tx_hash || `${tx.ts}_${tx.agent}`;
        if (!txPositionMapRef.current.has(stableKey)) {
          txPositionMapRef.current.set(stableKey, {
            xf: 0.06 + Math.random() * 0.88,
            yf: 0.06 + Math.random() * 0.88,
            pulsePhase: Math.random() * Math.PI * 2,
          });
        }
      });

      // Build rendered array
      txMeshNodesRef.current = visibleItems.map(tx => {
        const stableKey = tx.tx_hash || `${tx.ts}_${tx.agent}`;
        const pos = txPositionMapRef.current.get(stableKey) ?? { xf: 0.5, yf: 0.5, pulsePhase: 0 };
        const validTxLink = tx.tx_hash ? `https://www.oklink.com/xlayer/tx/${tx.tx_hash}` : undefined;
        return {
          x: pos.xf * W,
          y: pos.yf * H,
          color: tx.color,
          tx_hash: tx.tx_hash,
          agent: tx.agent,
          action: tx.action,
          txLink: validTxLink,
          is_x402: tx.is_x402,
          pulsePhase: pos.pulsePhase,
        };
      });

      // Check hover on TX nodes — 44px threshold for easy interaction
      let newHoveredIdx: number | null = null;
      if (mp) {
        let closestDist = 44;
        txMeshNodesRef.current.forEach((tn, i) => {
          const dx = tn.x - mp.x, dy = tn.y - mp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < closestDist) { closestDist = dist; newHoveredIdx = i; }
        });
      }
      hoveredTxIdxRef.current = newHoveredIdx;
      canvas.style.cursor = newHoveredIdx !== null ? "pointer" : "default";

      // Draw TX mesh nodes (holographic neon particles) — faded mesh layer behind main agents
      const phaseTick = frame * 0.04;
      txMeshNodesRef.current.forEach((tn, i) => {
        const isHovered = i === newHoveredIdx;
        const pulse = 1 + Math.sin(tn.pulsePhase + phaseTick) * 0.3;
        const baseR = isHovered ? 10 : 5;
        const r = baseR * pulse;

        // Connect TX node to nearby mesh nodes — cap at 40 nearest to prevent frame drops
        if (isHovered) {
          let connCount = 0;
          for (let mi = 0; mi < meshNodes.length && connCount < 40; mi++) {
            const m = meshNodes[mi];
            const dx = m.x - tn.x, dy = m.y - tn.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MESH_CONNECT_DIST * 0.8) {
              const alpha = (1 - dist / (MESH_CONNECT_DIST * 0.8)) * 0.25;
              ctx.strokeStyle = `${tn.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
              ctx.lineWidth = 0.4;
              ctx.beginPath();
              ctx.moveTo(tn.x, tn.y);
              ctx.lineTo(m.x, m.y);
              ctx.stroke();
              connCount++;
            }
          }
        }

        // Outer glow — tx nodes are the mesh layer (visible but softer than main NODES)
        const gAlpha = isHovered ? 0.7 : 0.38;
        const gR = r * (isHovered ? 5 : 3.5);
        const tg = ctx.createRadialGradient(tn.x, tn.y, 0, tn.x, tn.y, gR);
        tg.addColorStop(0, `${tn.color}${Math.round(gAlpha * 255).toString(16).padStart(2, "0")}`);
        tg.addColorStop(1, "transparent");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(tn.x, tn.y, gR, 0, Math.PI * 2);
        ctx.fill();

        // Core dot — brighter on hover
        ctx.globalAlpha = isHovered ? 1 : 0.75;
        ctx.fillStyle = tn.color;
        ctx.beginPath();
        ctx.arc(tn.x, tn.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Green ring for verified on-chain TX
        if (tn.tx_hash) {
          ctx.globalAlpha = isHovered ? 0.9 : 0.45;
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = isHovered ? 1.5 : 0.8;
          ctx.beginPath();
          ctx.arc(tn.x, tn.y, r * 2.1, 0, Math.PI * 2);
          ctx.stroke();
        }

        // x402 indicator — purple ring
        if (tn.is_x402) {
          ctx.globalAlpha = isHovered ? 0.9 : 0.45;
          ctx.strokeStyle = "#C084FC";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(tn.x, tn.y, r * 2.8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Hover label — show agent, action, tx hash if exists
        if (isHovered) {
          const label = `${tn.agent.replace("SILO-", "")} · ${tn.action}${tn.is_x402 ? " · x402" : ""}`;
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.fillStyle = tn.color;
          ctx.textAlign = "center";
          ctx.shadowColor = tn.color;
          ctx.shadowBlur = 10;
          ctx.fillText(label, tn.x, tn.y - r * 3 - 4);
          ctx.shadowBlur = 0;
          if (tn.tx_hash) {
            ctx.font = "9px 'JetBrains Mono', monospace";
            ctx.fillStyle = "#22c55e";
            ctx.fillText(tn.tx_hash.slice(0, 16) + "… ↗", tn.x, tn.y - r * 3 + 10);
          } else {
            ctx.font = "9px 'JetBrains Mono', monospace";
            ctx.fillStyle = "rgba(218,165,32,0.55)";
            ctx.fillText("click to explore", tn.x, tn.y - r * 3 + 10);
          }
        }
      });

      // ── LAYER 1 — Micro-particle field ────────────────────────────────────────
      micros.forEach(m => {
        m.vx *= 0.96; m.vy *= 0.96;
        if (Math.abs(m.vx) < 0.18) m.vx += (Math.random() - 0.5) * 0.04;
        if (Math.abs(m.vy) < 0.18) m.vy += (Math.random() - 0.5) * 0.04;
        m.x += m.vx; m.y += m.vy;
        if (m.x < 0) m.x += W; if (m.x > W) m.x -= W;
        if (m.y < 0) m.y += H; if (m.y > H) m.y -= H;

        m.phase += 0.008 + m.size * 0.002;
        m.alpha = 0.04 + Math.sin(m.phase) * 0.04 + Math.random() * 0.02;

        const c = MICRO_COLORS[m.colorIdx];
        ctx.globalAlpha = Math.max(0, Math.min(0.35, m.alpha));
        ctx.fillStyle = `rgba(${c},1)`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // ── LAYER 2 — Edge mesh (main neuron edges) ───────────────────────────────
      ctx.lineWidth = 1.2;
      EDGES.forEach(([f, t]) => {
        const key = `${f}-${t}`;
        const b = beziers[key];
        if (!b) return;
        const fromNode = NODES.find(n => n.id === f)!;
        const act1 = nodeActivity[f] ?? 0;
        const act2 = nodeActivity[t] ?? 0;
        const baseAlpha = 0.2 + Math.max(act1, act2) * 0.5;
        ctx.strokeStyle = `rgba(${fromNode.rgb},${baseAlpha})`;
        ctx.beginPath();
        ctx.moveTo(b.ax, b.ay);
        ctx.quadraticCurveTo(b.cx, b.cy, b.bx, b.by);
        ctx.stroke();
      });

      // ── LAYER 3 — Node glow + core (BRIGHT — top visual layer) ──────────────
      NODES.forEach(n => {
        const nx = n.xp * W, ny = n.yp * H;
        const act = nodeActivity[n.id] ?? 0;
        if (act > 0) nodeActivity[n.id] = Math.max(0, act - 0.012);

        const pulse = 1 + Math.sin(frame * 0.025 + NODES.indexOf(n) * 0.8) * 0.18;
        const baseR = (18 + act * 12) * pulse;

        // Wide outer glow halo — always bright
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, baseR * 5);
        glow.addColorStop(0,    `rgba(${n.rgb},${0.72 + act * 0.28})`);
        glow.addColorStop(0.3,  `rgba(${n.rgb},${0.28 + act * 0.2})`);
        glow.addColorStop(0.7,  `rgba(${n.rgb},${0.08 + act * 0.08})`);
        glow.addColorStop(1,    "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nx, ny, baseR * 5, 0, Math.PI * 2);
        ctx.fill();

        // Node body — solid and bright
        ctx.beginPath();
        ctx.arc(nx, ny, baseR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${n.rgb},${0.62 + act * 0.38})`;
        ctx.strokeStyle = `rgba(${n.rgb},${0.95})`;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Bright core dot
        const dotR = baseR * 0.38;
        ctx.beginPath();
        ctx.arc(nx, ny, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${n.rgb},${0.98})`;
        ctx.fill();

        // Rotating hexagon ring — visible
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6 + frame * 0.003;
          const hx = nx + Math.cos(a) * baseR * 1.65, hy = ny + Math.sin(a) * baseR * 1.65;
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${n.rgb},${0.45 + act * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label — always readable
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillStyle = `rgba(${n.rgb},${0.95})`;
        ctx.textAlign = "center";
        ctx.shadowColor = `rgba(${n.rgb},0.9)`;
        ctx.shadowBlur = 8;
        ctx.fillText(n.label, nx, ny + baseR + 16);
        ctx.shadowBlur = 0;
      });

      // ── LAYER 4 — Auto-launch cascade ─────────────────────────────────────────
      nextCascadeFrame--;
      if (nextCascadeFrame <= 0 && !cascade) {
        const pool = liveChainRef.current;
        const ch = pool[chainCursor % pool.length];
        chainCursor++;
        cascade = { chainIdx: chainCursor - 1, pathStep: 0, t: 0, trail: [], color: ch.color, completed: false, bursting: null };
        setChainDisplay({ steps: ch.steps, activeStep: 0, color: ch.color });
        nextCascadeFrame = 320 + Math.floor(Math.random() * 220);
      }

      // ── LAYER 5 — Cascade travel ──────────────────────────────────────────────
      if (cascade && !cascade.completed) {
        const pool = liveChainRef.current;
        const ch = pool[cascade.chainIdx % pool.length];
        const path = ch.path;
        const fromId = path[cascade.pathStep];
        const toId   = path[cascade.pathStep + 1];
        if (!fromId || !toId) {
          cascade.completed = true;
        } else {
          const fwdKey = `${fromId}-${toId}`;
          const revKey = `${toId}-${fromId}`;
          const isForward = fwdKey in beziers;
          const key = isForward ? fwdKey : revKey;
          const b = beziers[key];

          if (b) {
            cascade.t += 0.022;
            const { x, y } = isForward
              ? bezierPoint(b.ax, b.ay, b.cx, b.cy, b.bx, b.by, Math.min(cascade.t, 1))
              : bezierPoint(b.bx, b.by, b.cx, b.cy, b.ax, b.ay, Math.min(cascade.t, 1));

            cascade.trail.unshift({ x, y, alpha: 1, size: 4 });
            if (cascade.trail.length > 22) cascade.trail.pop();

            cascade.trail.forEach((tr, i) => {
              tr.alpha -= 0.045;
              if (tr.alpha <= 0) return;
              ctx.globalAlpha = tr.alpha * 0.9;
              const trGlow = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, tr.size * 2.5);
              trGlow.addColorStop(0, cascade!.color);
              trGlow.addColorStop(1, "transparent");
              ctx.fillStyle = trGlow;
              ctx.beginPath();
              ctx.arc(tr.x, tr.y, tr.size * 2.5 * (1 - i / 22), 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = tr.alpha;
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              ctx.arc(tr.x, tr.y, tr.size * (1 - i / 22) * 0.6, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.globalAlpha = 1;

            if (cascade.t >= 1) {
              cascade.t = 0;
              cascade.trail = [];
              const destNode = NODES.find(n => n.id === toId);
              if (destNode) {
                const dx = destNode.xp * W, dy = destNode.yp * H;
                spawnBurst(dx, dy, cascade.color, toId === "out1" || toId === "out2" ? 50 : 28);
                nodeActivity[toId] = 1.0;
              }
              cascade.pathStep++;
              setChainDisplay(prev => prev ? { ...prev, activeStep: cascade!.pathStep } : null);
              if (cascade.pathStep >= path.length - 1) {
                cascade.completed = true;
                setTimeout(() => setChainDisplay(null), 4500);
              }
            }
          } else {
            cascade.completed = true;
          }
        }
      }

      // ── LAYER 6 — Burst particles ─────────────────────────────────────────────
      for (let i = bursts.length - 1; i >= 0; i--) {
        const bp = bursts[i];
        bp.x += bp.vx; bp.y += bp.vy;
        bp.vx *= 0.94; bp.vy *= 0.94;
        bp.alpha -= 0.028;
        if (bp.alpha <= 0) { bursts.splice(i, 1); continue; }
        ctx.globalAlpha = bp.alpha;
        const bg = ctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, bp.size * 3);
        bg.addColorStop(0, bp.color);
        bg.addColorStop(1, "transparent");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, bp.size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = bp.alpha * 0.8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, bp.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── LAYER 7 — Shockwave rings ─────────────────────────────────────────────
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += (sw.maxR - sw.r) * 0.09 + 1.2;
        sw.alpha -= 0.022;
        if (sw.alpha <= 0) { shockwaves.splice(i, 1); continue; }

        ctx.globalAlpha = sw.alpha * 0.7;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.globalAlpha = sw.alpha * 0.35;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r * 0.65, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (sw.label && sw.r < 45) {
          ctx.globalAlpha = sw.alpha * 1.2;
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.fillStyle = sw.color;
          ctx.textAlign = "center";
          ctx.fillText(sw.label, sw.x, sw.y - sw.r - 6);
        }
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [buildEdgeBeziers]);

  const stepColors: Record<number, string> = { 0: "#00f0ff", 1: "#7c3aed", 2: "#DAA520", 3: "#22c55e" };
  const stepGlyphs = ["◈", "◊", "◇", "⬡"];
  const stepLabels = ["SIGNAL", "SKILL", "KNOWLEDGE", "OUTPUT"];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 40%, transparent 38%, rgba(5,4,2,0.85) 100%)" }} />
      <div style={{ position: "absolute", inset: "0 0 0 0", pointerEvents: "none", background: "linear-gradient(to bottom, rgba(5,4,2,0.7) 0%, transparent 15%, transparent 82%, rgba(5,4,2,0.95) 100%)" }} />

      {/* Mesh TX count badge */}
      {txMeshNodesRef.current.length > 0 && (
        <div style={{
          position: "absolute", top: 16, right: 16, zIndex: 15, pointerEvents: "none",
          background: "rgba(5,4,2,0.8)", border: "1px solid rgba(124,58,237,0.3)",
          padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{ fontSize: "0.55rem", color: "#7c3aed", letterSpacing: "0.2em" }}>
            ◈ {txMeshNodesRef.current.length} TX IN MESH
            {txMeshNodesRef.current.filter(t => t.is_x402).length > 0 && (
              <span style={{ color: "#C084FC", marginLeft: 6 }}>
                · {txMeshNodesRef.current.filter(t => t.is_x402).length} x402
              </span>
            )}
          </span>
        </div>
      )}

      {/* Hover hint */}
      <div style={{ position: "absolute", bottom: 72, inset: "auto 0 auto 0", zIndex: 15, pointerEvents: "none", textAlign: "center" }}>
        <span style={{ fontSize: "0.52rem", color: "#2A1E0A", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em" }}>
          hover mesh nodes · click tx → explode → on-chain
        </span>
      </div>

      {/* Reasoning chain overlay */}
      {chainDisplay && (
        <div style={{
          position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)",
          width: 272, background: "rgba(5,4,2,0.92)", border: "1px solid rgba(218,165,32,0.18)",
          backdropFilter: "blur(12px)", padding: "16px", zIndex: 20,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.25em", color: "#4A3A22", marginBottom: 14 }}>
            ACTIVE REASONING CHAIN
          </div>
          {chainDisplay.steps.map((step, i) => {
            const isActive = i === chainDisplay.activeStep;
            const isPast   = i < chainDisplay.activeStep;
            const col = stepColors[i] ?? "#6B5C3A";
            return (
              <div key={i} style={{ marginBottom: 10, opacity: isPast ? 0.45 : isActive ? 1 : 0.25 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: "0.65rem", color: col, textShadow: isActive ? `0 0 10px ${col}` : "none" }}>
                    {stepGlyphs[i]}
                  </span>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.15em", color: isActive ? col : "#4A3A22", textShadow: isActive ? `0 0 14px ${col}80` : "none" }}>
                    {stepLabels[i]} · {step.label}
                  </span>
                </div>
                <div style={{ paddingLeft: 18, fontSize: "0.65rem", color: isActive ? "#9A8060" : "#3A2C16", lineHeight: 1.5 }}>
                  {step.detail}
                </div>
                {isActive && (
                  <div style={{ paddingLeft: 18, fontSize: "0.6rem", color: col, opacity: 0.7, marginTop: 2 }}>
                    {step.extra}
                  </div>
                )}
                {i < chainDisplay.steps.length - 1 && (
                  <div style={{ paddingLeft: 14, fontSize: "0.65rem", color: "#2A1E0A", marginTop: 4 }}>↓</div>
                )}
              </div>
            );
          })}
          {chainDisplay.txLink && (
            <button
              onClick={() => { megaExplodeRef.current = { color: chainDisplay.color }; setTimeout(() => window.open(chainDisplay.txLink, "_blank", "noopener"), 420); }}
              style={{
                marginTop: 14, width: "100%", cursor: "pointer",
                background: `${chainDisplay.color}12`, border: `1px solid ${chainDisplay.color}50`,
                color: chainDisplay.color, padding: "7px 0",
                fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem",
                fontWeight: 700, letterSpacing: "0.2em",
                textShadow: `0 0 10px ${chainDisplay.color}60`,
                boxShadow: `0 0 16px ${chainDisplay.color}18`,
              }}
              title={chainDisplay.txHash}
            >
              ⬡ VERIFY ON-CHAIN ↗
            </button>
          )}
          {chainDisplay.txHash && (
            <div style={{ marginTop: 6, fontSize: "0.52rem", color: "#3A2C16", wordBreak: "break-all" as const }}>
              {chainDisplay.txHash.slice(0, 20)}…
            </div>
          )}
        </div>
      )}

      {/* Bottom-left: verified TX proof panel */}
      {recentTxs.length > 0 && (
        <div style={{
          position: "absolute", bottom: 28, left: 20, zIndex: 20,
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(5,4,2,0.88)", border: "1px solid rgba(34,197,94,0.15)",
          backdropFilter: "blur(12px)", padding: "10px 14px", maxWidth: 300,
        }}>
          <div style={{ fontSize: "0.55rem", letterSpacing: "0.25em", color: "#22c55e", marginBottom: 8 }}>
            ⬡ VERIFIED ON-CHAIN TRADES
          </div>
          {recentTxs.map((tx, i) => (
            <button
              key={i}
              onClick={() => { megaExplodeRef.current = { color: "#22c55e" }; setTimeout(() => window.open(tx.txLink, "_blank", "noopener"), 420); }}
              style={{
                display: "block", width: "100%", cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: i < recentTxs.length - 1 ? "1px solid #1A1208" : "none",
                padding: "5px 0", textAlign: "left" as const,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.6rem", color: "#22c55e" }}>⬡</span>
                <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#DAA520", letterSpacing: "0.1em" }}>{tx.agent}</span>
                <span style={{ fontSize: "0.58rem", color: "#4A3A22" }}>{tx.action}</span>
                <span style={{ fontSize: "0.55rem", color: "#22c55e", marginLeft: "auto", letterSpacing: "0.05em" }}>{tx.txHash.slice(0, 10)}… ↗</span>
              </div>
            </button>
          ))}
          <div style={{ marginTop: 6, fontSize: "0.52rem", color: "#2A1E0A" }}>click any TX → explode → OKLink</div>
        </div>
      )}
    </div>
  );
}
