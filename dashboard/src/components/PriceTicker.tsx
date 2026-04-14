"use client";

/**
 * SILOPOLIS — Live Price Ticker
 * Fixed footer scrolling ticker with OKB and X Layer ecosystem prices.
 * Mock data — wire to OKX MCP for live feed.
 */

import { useState, useEffect, useRef } from "react";

interface TickerToken {
  sym: string;
  price: number;
  change: number;  // % 24h
  highlight?: boolean;
}

const INITIAL_TOKENS: TickerToken[] = [
  { sym: "OKB",   price: 54.22,   change: +2.8,  highlight: true  },
  { sym: "XLayer",price: 0.00,    change: 0,     highlight: true  }, // Chain, not token — shows OKB
  { sym: "ETH",   price: 3420.50, change: +1.9  },
  { sym: "BTC",   price: 84250.00,change: +0.7  },
  { sym: "SOL",   price: 178.50,  change: +3.4  },
  { sym: "USDT",  price: 1.0002,  change: -0.01 },
  { sym: "SWRMX", price: 0.00890, change: +21.2, highlight: true  },
  { sym: "NEURAL",price: 0.00670, change: +346.7,highlight: true  },
  { sym: "INTNT", price: 0.3420,  change: +302.4,highlight: true  },
  { sym: "CORTX", price: 0.000095,change:+1087.5,highlight: true  },
  { sym: "OKT",   price: 15.80,   change: +4.2  },
  { sym: "USDC",  price: 0.9999,  change: 0.01  },
  { sym: "ZKPRF", price: 0.0560,  change: +22.4 },
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
  const [tokens, setTokens] = useState<TickerToken[]>(INITIAL_TOKENS);
  const trackRef = useRef<HTMLDivElement>(null);

  // Micro price fluctuations every 4s
  useEffect(() => {
    const iv = setInterval(() => {
      setTokens(prev => prev.map(t => {
        if (t.sym === "USDT" || t.sym === "USDC") return t;
        const delta = (Math.random() - 0.49) * 0.004; // slight upward bias
        const newPrice = t.price * (1 + delta);
        const changeDelta = (Math.random() - 0.48) * 0.1;
        return { ...t, price: newPrice, change: t.change + changeDelta };
      }));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const items = [...tokens, ...tokens]; // duplicate for seamless loop

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
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
        flexShrink: 0,
        paddingLeft: 14,
        paddingRight: 12,
        borderRight: "1px solid rgba(218,165,32,0.12)",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 6px #22c55e",
          display: "inline-block",
          animation: "pulse 1.5s infinite",
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
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            animation: "ticker-scroll 55s linear infinite",
          }}
        >
          {items.filter(t => t.sym !== "XLayer").map((t, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "0 20px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.72rem",
              }}
            >
              <span style={{
                fontWeight: 700,
                color: t.highlight ? "#DAA520" : "#9A8060",
                letterSpacing: "0.05em",
              }}>
                ${t.sym}
              </span>
              <span style={{ color: "#4A3A22" }}>
                {fmtPrice(t.price)}
              </span>
              <span style={{
                fontWeight: 600,
                color: t.change >= 0 ? "#22c55e" : "#ef4444",
              }}>
                {t.change >= 0 ? "+" : ""}{t.change.toFixed(1)}%
              </span>
              <span style={{ color: "#2A1E0A", padding: "0 4px" }}>|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Right: chain indicator */}
      <div style={{
        flexShrink: 0,
        paddingLeft: 12,
        paddingRight: 14,
        borderLeft: "1px solid rgba(218,165,32,0.12)",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{
          fontSize: "0.6rem", letterSpacing: "0.2em",
          color: "#4A3A22", fontFamily: "'JetBrains Mono', monospace",
        }}>
          X LAYER
        </span>
        <span style={{
          fontSize: "0.62rem", fontWeight: 700,
          color: "#DAA520", fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.1em",
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
