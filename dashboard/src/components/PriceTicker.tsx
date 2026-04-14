"use client";

/**
 * SILOPOLIS — Live Price Ticker
 * Fetches real prices from /api/prices (OKX public API) every 30s.
 * Micro-fluctuates in between for visual liveliness.
 */

import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const FETCH_HEADERS: HeadersInit = { "Bypass-Tunnel-Reminder": "true" };

interface TickerToken {
  sym: string;
  price: number;
  change: number;
  highlight?: boolean;
}

// Seed values — immediately overwritten from live API on mount
const SEED_TOKENS: TickerToken[] = [
  { sym: "OKB",   price: 84.89,     change: +2.8,    highlight: true  },
  { sym: "BTC",   price: 74497.0,   change: +0.7               },
  { sym: "ETH",   price: 2373.82,   change: +1.9               },
  { sym: "SOL",   price: 85.90,     change: +3.4               },
  { sym: "USDT",  price: 1.0000,    change:  0.0               },
  { sym: "USDC",  price: 0.9999,    change:  0.01              },
  { sym: "INTNT", price: 0.3420,    change: +302.4,  highlight: true  },
  { sym: "CORTX", price: 0.000095,  change:+1087.5,  highlight: true  },
  { sym: "ZKPRF", price: 0.0560,    change: +22.4               },
];

function fmtPrice(p: number): string {
  if (p >= 10000)  return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100)    return "$" + p.toFixed(2);
  if (p >= 1)      return "$" + p.toFixed(3);
  if (p >= 0.01)   return "$" + p.toFixed(4);
  if (p >= 0.0001) return "$" + p.toFixed(6);
  return "$" + p.toFixed(9);
}

export default function PriceTicker() {
  const [tokens, setTokens] = useState<TickerToken[]>(SEED_TOKENS);
  const trackRef = useRef<HTMLDivElement>(null);

  // Fetch real prices from OKX API via our backend
  const fetchPrices = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/prices`, { headers: FETCH_HEADERS });
      if (!r.ok) return;
      const data = await r.json();
      const prices: Record<string, number> = data.prices ?? {};
      const changes: Record<string, number> = data.change24h ?? {};
      if (!Object.keys(prices).length) return;
      setTokens(prev => prev.map(t => {
        const livePrice = prices[t.sym];
        if (!livePrice) return t;
        return {
          ...t,
          price: livePrice,
          change: changes[t.sym] ?? t.change,
        };
      }));
    } catch {
      // Stay on current values
    }
  };

  useEffect(() => {
    fetchPrices();
    const iv = setInterval(fetchPrices, 30_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Micro-fluctuations every 4s for visual liveliness between API refreshes
  useEffect(() => {
    const iv = setInterval(() => {
      setTokens(prev => prev.map(t => {
        if (t.sym === "USDT" || t.sym === "USDC") return t;
        const delta = (Math.random() - 0.49) * 0.0025;
        const changeDelta = (Math.random() - 0.48) * 0.06;
        return { ...t, price: Math.max(t.price * (1 + delta), 0.0000001), change: t.change + changeDelta };
      }));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const items = [...tokens, ...tokens]; // duplicate for seamless loop

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      height: 40,
      background: "rgba(5,4,2,0.97)",
      borderTop: "1px solid rgba(218,165,32,0.15)",
      backdropFilter: "blur(12px)",
      zIndex: 9000,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
    }}>
      {/* Left label */}
      <div style={{
        flexShrink: 0, paddingLeft: 14, paddingRight: 12,
        borderRight: "1px solid rgba(218,165,32,0.12)",
        height: "100%", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22c55e", boxShadow: "0 0 6px #22c55e",
          display: "inline-block", animation: "pulse 1.5s infinite",
        }} />
        <span style={{
          fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em",
          color: "#DAA520", fontFamily: "'JetBrains Mono', monospace",
        }}>
          LIVE
        </span>
      </div>

      {/* Scrolling ticker */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div
          ref={trackRef}
          style={{
            display: "flex", alignItems: "center",
            whiteSpace: "nowrap",
            animation: "ticker-scroll 60s linear infinite",
          }}
        >
          {items.map((t, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "0 20px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem",
              }}
            >
              <span style={{ fontWeight: 700, color: t.highlight ? "#DAA520" : "#9A8060", letterSpacing: "0.05em" }}>
                ${t.sym}
              </span>
              <span style={{ color: "#4A3A22" }}>{fmtPrice(t.price)}</span>
              <span style={{ fontWeight: 600, color: t.change >= 0 ? "#22c55e" : "#ef4444" }}>
                {t.change >= 0 ? "+" : ""}{t.change.toFixed(1)}%
              </span>
              <span style={{ color: "#2A1E0A", padding: "0 4px" }}>|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Right: chain indicator */}
      <div style={{
        flexShrink: 0, paddingLeft: 12, paddingRight: 14,
        borderLeft: "1px solid rgba(218,165,32,0.12)",
        height: "100%", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontSize: "0.6rem", letterSpacing: "0.2em",
          color: "#4A3A22", fontFamily: "'JetBrains Mono', monospace",
        }}>
          X LAYER
        </span>
        <span style={{
          fontSize: "0.62rem", fontWeight: 700,
          color: "#DAA520", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
        }}>
          #196
        </span>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
