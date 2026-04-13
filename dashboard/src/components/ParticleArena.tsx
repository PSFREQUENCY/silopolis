"use client";

/**
 * SILOPOLIS — Sentient Particle Arena
 * A living visualization of the agent swarm: opportunities, reputation,
 * mastery progression, and skill convergence — rendered in real time.
 *
 * Particle types:
 *   HUMAN  — gold/amber  — human traders ascending through mastery tiers
 *   AGENT  — cyan/teal   — AI agents compounding skills autonomously
 *   SKILL  — purple hub  — skill nodes (DEX, market-scan, x402, LP, etc.)
 *   OPPORTUNITY — white burst — emerging on-chain opportunities
 */

import { useEffect, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AgentData {
  name: string;
  type: string;
  composite: number;    // 0–1000
  skills: number;
  tx_count: number;
}

interface ParticleArenaProps {
  agents?: AgentData[];
  width?: number;
  height?: number;
  className?: string;
}

// ─── Particle Engine ────────────────────────────────────────────────────────

const SKILL_NODES = [
  { id: "dex-swap",       label: "Swap Relic",     color: "#34D399", x_pct: 0.20, y_pct: 0.25 },
  { id: "market-scan",    label: "Oracle Lens",    color: "#60A5FA", x_pct: 0.50, y_pct: 0.15 },
  { id: "x402-payments",  label: "Cipher Token",   color: "#C084FC", x_pct: 0.80, y_pct: 0.25 },
  { id: "lp-strategy",    label: "Liquidity Glyph",color: "#DAA520", x_pct: 0.85, y_pct: 0.65 },
  { id: "reputation",     label: "Vault Sigil",    color: "#F472B6", x_pct: 0.50, y_pct: 0.80 },
  { id: "skill-market",   label: "Exchange Tablet",color: "#06B6D4", x_pct: 0.15, y_pct: 0.65 },
  { id: "swarmfi",        label: "Cognition Core", color: "#B8860B", x_pct: 0.35, y_pct: 0.48 },
  { id: "threat-gate",    label: "Arbiter Seal",   color: "#FB923C", x_pct: 0.65, y_pct: 0.48 },
];

type ParticleType = "HUMAN" | "AGENT" | "OPPORTUNITY" | "TRAIL";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: ParticleType;
  nodeId: string;
  reputation: number;   // 0–1
  mastery: number;      // 0–1
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  life: number;         // 0–1 (OPPORTUNITY fades)
  name?: string;
  id: number;
}

interface OpportunityBurst {
  x: number;
  y: number;
  age: number;         // frames
  maxAge: number;
  intensity: number;
}

let _nextId = 0;

function makeParticle(
  x: number, y: number,
  type: ParticleType,
  nodeId: string,
  reputation = 0.5,
  mastery = 0.1,
  name?: string,
): Particle {
  const speed = type === "AGENT" ? 0.8 + Math.random() * 1.2 : 0.3 + Math.random() * 0.6;
  const angle = Math.random() * Math.PI * 2;
  return {
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    type, nodeId, reputation, mastery,
    orbitAngle: Math.random() * Math.PI * 2,
    orbitRadius: 40 + Math.random() * 60,
    orbitSpeed: (Math.random() < 0.5 ? 1 : -1) * (0.004 + Math.random() * 0.008),
    life: 1.0, name, id: _nextId++,
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ─── Component ─────────────────────────────────────────────────────────────

export default function ParticleArena({ agents = [], className = "" }: ParticleArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    particles: [] as Particle[],
    bursts: [] as OpportunityBurst[],
    mouse: { x: -999, y: -999, down: false },
    frame: 0,
    agents: agents,
    nextOpportunity: 120,
    width: 0,
    height: 0,
  });

  // Seed particles from agent data or defaults
  const seedParticles = useCallback((w: number, h: number, agentList: AgentData[]) => {
    const state = stateRef.current;
    state.particles = [];

    // Bootstrap agents into particles
    const roster = agentList.length > 0 ? agentList : [
      { name: "SILO-TRADER-1",  type: "trader",      composite: 520, skills: 3, tx_count: 12 },
      { name: "SILO-ANALYST-2", type: "analyst",      composite: 490, skills: 4, tx_count: 8  },
      { name: "SILO-SKILL-3",   type: "skill-broker", composite: 550, skills: 5, tx_count: 20 },
      { name: "SILO-GUARD-4",   type: "arbiter",      composite: 610, skills: 2, tx_count: 6  },
      { name: "SILO-SCRIBE-5",  type: "scribe",       composite: 475, skills: 3, tx_count: 15 },
    ];

    SKILL_NODES.forEach((node, ni) => {
      const nx = node.x_pct * w;
      const ny = node.y_pct * h;

      // Each skill node gets 3–6 AI agent particles orbiting it
      const agentCount = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < agentCount; i++) {
        const agent = roster[Math.floor(Math.random() * roster.length)];
        const rep = clamp(agent.composite / 1000, 0.1, 1.0);
        const mastery = clamp(agent.skills / 10, 0.1, 1.0);
        const angle = (i / agentCount) * Math.PI * 2;
        const r = 40 + Math.random() * 50;
        const p = makeParticle(nx + Math.cos(angle) * r, ny + Math.sin(angle) * r,
          "AGENT", node.id, rep, mastery, agent.name);
        p.orbitAngle = angle;
        p.orbitRadius = r;
        state.particles.push(p);
      }

      // Each node gets 1–2 human learner particles (slower, larger)
      const humanCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < humanCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 80 + Math.random() * 60;
        const mastery = 0.1 + Math.random() * 0.5;
        const p = makeParticle(nx + Math.cos(angle) * r, ny + Math.sin(angle) * r,
          "HUMAN", node.id, 0.4 + Math.random() * 0.4, mastery);
        p.orbitAngle = angle;
        p.orbitRadius = r;
        state.particles.push(p);
      }
    });
  }, []);

  const spawnOpportunity = useCallback((x: number, y: number, w: number, h: number) => {
    const state = stateRef.current;
    // Burst visual
    state.bursts.push({ x, y, age: 0, maxAge: 80, intensity: 0.8 + Math.random() * 0.2 });
    // Spawn 8–15 opportunity particles
    const count = 8 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1 + Math.random() * 2.5;
      const nodeIdx = Math.floor(Math.random() * SKILL_NODES.length);
      const p = makeParticle(x, y, "OPPORTUNITY", SKILL_NODES[nodeIdx].id, 0.9, 0.8);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1.0;
      state.particles.push(p);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let running = true;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w;
      canvas.height = h;
      stateRef.current.width = w;
      stateRef.current.height = h;
      seedParticles(w, h, stateRef.current.agents);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    // Mouse handlers
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      stateRef.current.mouse.x = e.clientX - rect.left;
      stateRef.current.mouse.y = e.clientY - rect.top;
    };
    const onDown = () => { stateRef.current.mouse.down = true; };
    const onUp = (e: MouseEvent) => {
      stateRef.current.mouse.down = false;
      const rect = canvas.getBoundingClientRect();
      spawnOpportunity(e.clientX - rect.left, e.clientY - rect.top,
        stateRef.current.width, stateRef.current.height);
    };
    const onLeave = () => { stateRef.current.mouse.x = -999; stateRef.current.mouse.y = -999; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onLeave);

    // ─── Main render loop ───────────────────────────────────────────────────
    const render = () => {
      if (!running) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const state = stateRef.current;
      const { width: W, height: H, mouse, frame } = state;
      state.frame++;

      // ── Background (ancient void — deep sepia black) ────────────────────
      ctx.fillStyle = "rgba(5, 4, 2, 0.92)";
      ctx.fillRect(0, 0, W, H);

      // Subtle ancient gold radial from center
      const centerGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.6);
      centerGrad.addColorStop(0, "rgba(184, 134, 11, 0.04)");
      centerGrad.addColorStop(0.4, "rgba(218, 165, 32, 0.02)");
      centerGrad.addColorStop(1, "transparent");
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Skill Nodes ─────────────────────────────────────────────────────
      SKILL_NODES.forEach((node, _ni) => {
        const nx = node.x_pct * W;
        const ny = node.y_pct * H;
        const pulse = 1 + Math.sin(frame * 0.02 + _ni * 0.9) * 0.15;
        const baseR = 16 * pulse;

        // Outer glow
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, baseR * 4);
        glow.addColorStop(0, node.color + "40");
        glow.addColorStop(0.4, node.color + "18");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nx, ny, baseR * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core circle
        ctx.beginPath();
        ctx.arc(nx, ny, baseR, 0, Math.PI * 2);
        ctx.fillStyle = node.color + "30";
        ctx.strokeStyle = node.color + "cc";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Hexagon overlay
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const hx = nx + Math.cos(a) * baseR * 1.4;
          const hy = ny + Math.sin(a) * baseR * 1.4;
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.strokeStyle = node.color + "50";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Label
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillStyle = node.color + "cc";
        ctx.textAlign = "center";
        ctx.fillText(node.label, nx, ny + baseR + 14);
      });

      // ── Burst Effects ───────────────────────────────────────────────────
      state.bursts = state.bursts.filter(b => b.age < b.maxAge);
      state.bursts.forEach(burst => {
        const t = burst.age / burst.maxAge;
        const r = t * 120;
        const alpha = (1 - t) * burst.intensity;
        const g = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, r);
        g.addColorStop(0, `rgba(255,255,255,${alpha * 0.8})`);
        g.addColorStop(0.3, `rgba(99,255,200,${alpha * 0.5})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, r, 0, Math.PI * 2);
        ctx.fill();
        burst.age++;
      });

      // ── Auto-opportunity ─────────────────────────────────────────────────
      state.nextOpportunity--;
      if (state.nextOpportunity <= 0) {
        const node = SKILL_NODES[Math.floor(Math.random() * SKILL_NODES.length)];
        spawnOpportunity(node.x_pct * W, node.y_pct * H, W, H);
        state.nextOpportunity = 180 + Math.floor(Math.random() * 240); // every 3–7s at 60fps
      }

      // ── Connection Lines (skill-sharing) ────────────────────────────────
      // Draw lines between agent particles near the same skill node
      const agentsByNode: Record<string, Particle[]> = {};
      state.particles.filter(p => p.type === "AGENT").forEach(p => {
        if (!agentsByNode[p.nodeId]) agentsByNode[p.nodeId] = [];
        agentsByNode[p.nodeId].push(p);
      });
      Object.values(agentsByNode).forEach(group => {
        for (let i = 0; i < group.length - 1; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i], b = group[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 80) {
              const alpha = (1 - dist / 80) * 0.15 * Math.min(a.mastery, b.mastery);
              const node = SKILL_NODES.find(n => n.id === a.nodeId);
              ctx.strokeStyle = (node?.color ?? "#6EE7B7") + Math.floor(alpha * 255).toString(16).padStart(2, "0");
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      });

      // ── Particles ────────────────────────────────────────────────────────
      const toRemove = new Set<number>();

      state.particles.forEach(p => {
        const node = SKILL_NODES.find(n => n.id === p.nodeId);
        const nx = node ? node.x_pct * W : W / 2;
        const ny = node ? node.y_pct * H : H / 2;

        if (p.type === "OPPORTUNITY") {
          // OPPORTUNITY: drift outward, fade and migrate toward a node
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.97;
          p.vy *= 0.97;
          // Attract to node center after initial burst
          if (p.life < 0.7) {
            const dx = nx - p.x, dy = ny - p.y;
            const d = Math.sqrt(dx*dx + dy*dy) + 1;
            p.vx += (dx / d) * 0.08;
            p.vy += (dy / d) * 0.08;
          }
          p.life -= 0.012;
          if (p.life <= 0) { toRemove.add(p.id); return; }

          // Render: bright star
          ctx.save();
          ctx.globalAlpha = p.life;
          const r = 3 + p.mastery * 3;
          const stGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
          stGlow.addColorStop(0, "rgba(255,255,255,0.9)");
          stGlow.addColorStop(0.3, "rgba(180,255,220,0.5)");
          stGlow.addColorStop(1, "transparent");
          ctx.fillStyle = stGlow;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          return;
        }

        // AGENT / HUMAN: orbit their skill node
        p.orbitAngle += p.orbitSpeed;
        // Mastery increases orbit speed slightly
        const targetR = p.orbitRadius * (0.8 + p.mastery * 0.4);
        const targetX = nx + Math.cos(p.orbitAngle) * targetR;
        const targetY = ny + Math.sin(p.orbitAngle) * targetR;

        // Mouse repulsion / attraction
        const mx = mouse.x, my = mouse.y;
        const mdx = p.x - mx, mdy = p.y - my;
        const md = Math.sqrt(mdx*mdx + mdy*mdy) + 1;
        if (md < 120) {
          const force = (120 - md) / 120 * 0.3;
          p.vx += (mdx / md) * force;
          p.vy += (mdy / md) * force;
        }

        // Spring toward orbit position
        const springDx = targetX - p.x;
        const springDy = targetY - p.y;
        const springF = 0.015;
        p.vx += springDx * springF;
        p.vy += springDy * springF;

        // Damping
        p.vx *= 0.94;
        p.vy *= 0.94;

        p.x += p.vx;
        p.y += p.vy;

        // Slowly increase mastery (learning over time)
        if (frame % 300 === 0 && p.type === "AGENT") {
          p.mastery = Math.min(1.0, p.mastery + 0.01);
        }

        // Render
        const isAgent = p.type === "AGENT";
        // Agents: ancient corrupted bronze. Humans: pure ancient gold.
        const baseColor = isAgent ? "52,211,153" : "218,165,32";  // jade : gold
        const r = isAgent
          ? (3 + p.reputation * 4) * (0.7 + p.mastery * 0.6)
          : (5 + p.reputation * 5) * (0.7 + p.mastery * 0.8);

        // Glow halo (reputation = halo size)
        ctx.save();
        const haloR = r * (2 + p.reputation * 3);
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
        halo.addColorStop(0, `rgba(${baseColor},${0.3 + p.mastery * 0.3})`);
        halo.addColorStop(0.5, `rgba(${baseColor},${0.1 * p.reputation})`);
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2); ctx.fill();

        // Core
        const brightness = 0.5 + p.mastery * 0.5;
        ctx.fillStyle = `rgba(${baseColor},${brightness})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();

        // Mastery ring (shows level)
        if (p.mastery > 0.5) {
          ctx.strokeStyle = `rgba(${baseColor},${(p.mastery - 0.5) * 0.8})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      });

      // Clean up dead particles
      state.particles = state.particles.filter(p => !toRemove.has(p.id));

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [seedParticles, spawnOpportunity]);

  // Update agent data when prop changes
  useEffect(() => {
    stateRef.current.agents = agents;
    if (stateRef.current.width > 0) {
      seedParticles(stateRef.current.width, stateRef.current.height, agents);
    }
  }, [agents, seedParticles]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full cursor-crosshair ${className}`}
      style={{ display: "block" }}
    />
  );
}
