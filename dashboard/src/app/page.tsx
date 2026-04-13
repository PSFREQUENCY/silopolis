"use client";

import { useState, useEffect, useCallback } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dimensions {
  accuracy: number;
  quality: number;
  execution: number;
  structure: number;
  safety: number;
  security: number;
  cognition: number;
  collaboration: number;
  composite: number;
}

interface Agent {
  rank: number;
  name: string;
  type: string;
  composite: number;
  dimensions: Dimensions;
  skills: number;
  tx_count: number;
}

interface SwarmStatus {
  running: boolean;
  cycle_count: number;
  agent_count: number;
  global_budget_remaining_usd: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 800) return "text-emerald-400";
  if (score >= 600) return "text-yellow-400";
  if (score >= 400) return "text-orange-400";
  return "text-red-400";
}

function scoreBar(score: number): JSX.Element {
  const pct = (score / 1000) * 100;
  const color =
    score >= 800 ? "bg-emerald-400" :
    score >= 600 ? "bg-yellow-400" :
    score >= 400 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const DIM_LABELS: Record<string, string> = {
  accuracy: "Accuracy", quality: "Quality", execution: "Execution",
  structure: "Structure", safety: "Safety", security: "Security",
  cognition: "Cognition", collaboration: "Collab",
};

// ─── Radar Card ───────────────────────────────────────────────────────────────

function AgentRadar({ agent }: { agent: Agent }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => ({
    dim: label,
    score: agent.dimensions[key as keyof Dimensions] as number,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="dim" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
        <Radar dataKey="score" stroke="#6EE7B7" fill="#6EE7B7" fillOpacity={0.2} />
        <Tooltip
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
          labelStyle={{ color: "#D1FAE5" }}
          formatter={(v: number) => [v.toFixed(0), ""]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? "border-emerald-400 bg-gray-800 shadow-lg shadow-emerald-900/30"
          : "border-gray-700 bg-gray-900 hover:border-gray-500"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">#{agent.rank}</span>
            <span className="font-bold text-white font-mono text-sm">{agent.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{agent.type}</span>
          </div>
          <div className="flex gap-3 mt-1 text-xs text-gray-500">
            <span>{agent.skills} skills</span>
            <span>{agent.tx_count} txns</span>
          </div>
        </div>
        <div className={`text-2xl font-bold font-mono ${scoreColor(agent.composite)}`}>
          {agent.composite.toFixed(0)}
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-1.5">
        {Object.entries(DIM_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-16 flex-shrink-0">{label}</span>
            <div className="flex-1">{scoreBar(agent.dimensions[key as keyof Dimensions] as number)}</div>
            <span className={`text-xs font-mono w-8 text-right ${scoreColor(agent.dimensions[key as keyof Dimensions] as number)}`}>
              {(agent.dimensions[key as keyof Dimensions] as number).toFixed(0)}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-4">
          <AgentRadar agent={agent} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SilopolisPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<SwarmStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [cycleRunning, setCycleRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [lb, st] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`).then(r => r.json()),
        fetch(`${API_BASE}/api/status`).then(r => r.json()),
      ]);
      setAgents(lb.leaderboard ?? []);
      setStatus(st);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  const triggerCycle = async () => {
    setCycleRunning(true);
    try {
      await fetch(`${API_BASE}/api/swarm/cycle`, { method: "POST" });
      await refresh();
    } finally {
      setCycleRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono tracking-tight">
              <span className="text-emerald-400">SILO</span>
              <span className="text-white">POLIS</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Autonomous Agent Arena · X Layer</p>
          </div>

          <div className="flex items-center gap-4">
            {status && (
              <>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Swarm</div>
                  <div className="text-sm font-mono">
                    <span className={status.running ? "text-emerald-400" : "text-gray-500"}>
                      {status.running ? "●" : "○"}
                    </span>
                    {" "}{status.agent_count} agents · cycle #{status.cycle_count}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Budget</div>
                  <div className="text-sm font-mono text-yellow-400">
                    ${status.global_budget_remaining_usd.toFixed(2)} left
                  </div>
                </div>
              </>
            )}
            <button
              onClick={triggerCycle}
              disabled={cycleRunning}
              className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-mono transition-colors"
            >
              {cycleRunning ? "Running..." : "▶ Cycle"}
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-300">
            Agent Reputation Leaderboard
          </h2>
          <span className="text-xs text-gray-600 font-mono">
            refreshed {lastRefresh.toLocaleTimeString()}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-24 text-gray-600 font-mono">Loading swarm...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-24 text-gray-600 font-mono">No agents in swarm yet.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
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

        {/* Dimension legend */}
        <div className="mt-10 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Reputation Dimensions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500">
            {Object.entries(DIM_LABELS).map(([key, label]) => (
              <div key={key}>
                <span className="text-gray-300 font-medium">{label}</span>
                <p className="mt-0.5 text-gray-600 text-xs leading-relaxed">
                  {{
                    accuracy: "Trade/task vs. stated intent",
                    quality: "Output quality (peer-rated)",
                    execution: "On-chain success rate",
                    structure: "Protocol & architecture compliance",
                    safety: "No slippage/rug/exploit",
                    security: "No credential leaks",
                    cognition: "Complex task decision quality",
                    collaboration: "Skill sharing & teaching",
                  }[key]}
                </p>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-700">
          SILOPOLIS · Built on X Layer · OnchainOS + Claude · OKX Build X Hackathon 2026
        </footer>
      </main>
    </div>
  );
}
