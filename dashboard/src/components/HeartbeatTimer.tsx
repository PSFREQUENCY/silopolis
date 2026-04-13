"use client";

/**
 * SILOPOLIS — Live Heartbeat Timer
 * Shows time since last heartbeat, countdown to next (8h cycle),
 * and live pulse while a cycle is running.
 */

import { useState, useEffect, useRef } from "react";

interface HeartbeatData {
  heartbeat_id?: string;
  started_at?: number;
  completed_at?: number;
  agents_run?: number;
  actions_taken?: number;
  errors?: number;
  market_sentiment?: string;
}

interface HeartbeatTimerProps {
  apiBase?: string;
  cycleIntervalSec?: number;
}

function pad(n: number) { return n.toString().padStart(2, "0"); }

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: "#34D399",
  bearish: "#F87171",
  neutral: "#6B7280",
};

export default function HeartbeatTimer({
  apiBase = "",
  cycleIntervalSec = 28800, // 8 hours
}: HeartbeatTimerProps) {
  const [last, setLast] = useState<HeartbeatData | null>(null);
  const [sinceLastSec, setSinceLastSec] = useState(0);
  const [nextInSec, setNextInSec] = useState(cycleIntervalSec);
  const [cycleCount, setCycleCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Fetch heartbeat status from API
  const fetchStatus = async () => {
    try {
      const resp = await fetch(`${apiBase}/api/heartbeat/status`);
      if (resp.ok) {
        const data = await resp.json();
        const hb: HeartbeatData = data.last_heartbeat ?? {};
        setLast(hb);
        setCycleCount(data.total_cycles ?? 0);
        setIsRunning(data.running ?? false);
      }
    } catch {
      // API offline — show static timer only
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30s for new heartbeat data
    const pollId = setInterval(fetchStatus, 30_000);
    return () => clearInterval(pollId);
  }, []); // eslint-disable-line

  // Tick every second
  useEffect(() => {
    const tick = () => {
      const now = Date.now() / 1000;
      if (last?.completed_at) {
        const since = now - last.completed_at;
        setSinceLastSec(since);
        const remaining = Math.max(0, cycleIntervalSec - since);
        setNextInSec(remaining);
      } else {
        // No heartbeat yet — count up from page load
        setSinceLastSec(prev => prev + 1);
      }
    };
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [last, cycleIntervalSec]);

  const pct = last?.completed_at
    ? Math.min(100, ((cycleIntervalSec - nextInSec) / cycleIntervalSec) * 100)
    : 0;

  const sentiment = last?.market_sentiment ?? "neutral";
  const sentimentColor = SENTIMENT_COLORS[sentiment] ?? "#6B7280";

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 select-none"
      style={{ background: "#080604", border: "1px solid #2A1E0A" }}
    >
      {/* Pulse dot */}
      <div className="relative flex-shrink-0">
        <span
          className="block w-2 h-2 rounded-full"
          style={{
            background: isRunning ? "#34D399" : "#B8860B",
            boxShadow: isRunning ? "0 0 8px #34D399" : "0 0 6px #B8860B60",
          }}
        />
        {isRunning && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "#34D39940" }}
          />
        )}
      </div>

      {/* Timer block */}
      <div className="flex items-center gap-2 font-mono text-xs">
        {isRunning ? (
          <span style={{ color: "#34D399" }} className="tracking-wider">CYCLE RUNNING...</span>
        ) : (
          <>
            {/* Last heartbeat */}
            <span style={{ color: "#4A3A22" }}>LAST</span>
            <span style={{ color: "#9A8060" }}>
              {sinceLastSec > 0 ? formatDuration(sinceLastSec) : "—"} ago
            </span>
            <span style={{ color: "#2A1E0A" }}>|</span>
            {/* Next heartbeat */}
            <span style={{ color: "#4A3A22" }}>NEXT</span>
            <span
              style={{ color: nextInSec < 3600 ? "#DAA520" : "#6B5C3A" }}
              className={nextInSec < 600 ? "animate-pulse" : ""}
            >
              {formatDuration(nextInSec)}
            </span>
          </>
        )}
      </div>

      {/* Progress bar (fills as next cycle approaches) */}
      <div
        className="hidden md:block w-16 h-1 rounded-none overflow-hidden"
        style={{ background: "#1A1208" }}
      >
        <div
          className="h-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #B8860B, #DAA520)`,
            boxShadow: "0 0 4px #B8860B60",
          }}
        />
      </div>

      {/* Cycle count */}
      {cycleCount > 0 && (
        <div className="hidden lg:flex items-center gap-1 font-mono text-xs" style={{ color: "#4A3A22" }}>
          <span>CYC</span>
          <span style={{ color: "#6B5C3A" }}>#{cycleCount}</span>
        </div>
      )}

      {/* Sentiment badge */}
      {last && (
        <div
          className="hidden lg:block px-1.5 py-0.5 font-mono text-xs tracking-widest uppercase"
          style={{ color: sentimentColor, border: `1px solid ${sentimentColor}30`, background: `${sentimentColor}10` }}
        >
          {sentiment}
        </div>
      )}

      {/* Agent/action count from last run */}
      {last?.agents_run != null && (
        <div className="hidden xl:flex items-center gap-1 font-mono text-xs" style={{ color: "#4A3A22" }}>
          <span style={{ color: "#6B5C3A" }}>{last.agents_run}</span>
          <span>agents</span>
          <span style={{ color: "#2A1E0A" }}>·</span>
          <span style={{ color: "#6B5C3A" }}>{last.actions_taken}</span>
          <span>acts</span>
        </div>
      )}
    </div>
  );
}
