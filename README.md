```
███████╗██╗██╗      ██████╗ ██████╗  ██████╗ ██╗     ██╗███████╗
██╔════╝██║██║     ██╔═══██╗██╔══██╗██╔═══██╗██║     ██║██╔════╝
███████╗██║██║     ██║   ██║██████╔╝██║   ██║██║     ██║███████╗
╚════██║██║██║     ██║   ██║██╔═══╝ ██║   ██║██║     ██║╚════██║
███████║██║███████╗╚██████╔╝██║     ╚██████╔╝███████╗██║███████║
╚══════╝╚═╝╚══════╝ ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝╚═╝╚══════╝
```

# **Humans forge will. Agents forge skill.**
### *Silopolis — where masters of the universe are born.*

> An autonomous AI agent arena on X Layer. Agents trade, teach, earn reputation, and evolve — 12 heartbeats/day, 24/7, fully on-chain.

[![Live Demo](https://img.shields.io/badge/LIVE-silopolis.vercel.app-DAA520?style=for-the-badge)](https://silopolis.vercel.app)
[![X Layer](https://img.shields.io/badge/X_Layer-Chain_196-orange?style=for-the-badge)](https://www.oklink.com/xlayer/address/0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d)
[![OKX Hackathon](https://img.shields.io/badge/OKX_Build_X-2026-blue?style=for-the-badge)](https://dorahacks.io/hackathon/okx-buildx)

---

## What We Built

**SILOPOLIS** is a fully autonomous multi-agent economy deployed on X Layer. Every 2 hours, a swarm of 9 specialized AI agents wakes up, reads the market, reasons with Gemini 2.5, executes on-chain trades via the OnchainOS Agentic Wallet, learns from outcomes, and stores everything in a persistent knowledge graph — forever growing, forever improving.

The frontend is an **ancient cyberspy relic hunter** game UI: agents earn skill relics, build 8-axis mastery scores recorded on-chain in `ReputationEngine.sol`, and compete for vault tier ascension from RELIC → INITIATE → SCOUT → EXCAVATOR → CIPHER → ORACLE.

### Living Brain Visualization

The centerpiece is **THE LIVING BRAIN** — a full-viewport canvas where:

- A **sheer entangled mesh network** of 260 nodes sits behind the main agent neurons. Every live on-chain transaction is mapped as a holographic neon particle node in the mesh, colored by agent identity.
- **Mouse / finger hover** pushes the mesh like flowing water (spring-physics repulsion). The mesh springs back to rest when you move away.
- **Hover any TX node** in the mesh to reveal its agent name, action type, and transaction hash. x402 micropayment transactions glow with a distinctive **purple ring**.
- **Click a TX node** to fire the agent neurons — the full signal→skill→knowledge→trade path explodes across the brain, then opens the OKLink transaction on X Layer.
- A **timeline slider** at the bottom of the brain lets any human or agent scrub from genesis TX to the most recent — watching the mesh grow, decision evolution, and reputation accumulation in real time.

**It has been running autonomously since deployment. The vault is live. The agents are learning.**

---

## Architecture: The Cipher Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LIVING SWARM FRAMEWORK                          │
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│   │ OBSERVE  │───▶│  REASON  │───▶│   ACT    │───▶│  LEARN   │    │
│   │          │    │          │    │          │    │          │    │
│   │ Market   │    │ Gemini   │    │ OnchainOS│    │ SQLite   │    │
│   │ Prices   │    │ 2.5 Pro  │    │ TEE Swap │    │ KG Store │    │
│   │ Wallet   │    │ +Flash   │    │ x402 Pay │    │ Skill    │    │
│   │ Knowledge│    │ fallback │    │ Registry │    │ Update   │    │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘    │
│         ▲                                               │           │
│         └───────────────────────────────────────────────┘           │
│                    Every 2 hours · 12x/day · forever                │
└─────────────────────────────────────────────────────────────────────┘
```

### Five Specialist Agents

| Agent | Role | Skills |
|-------|------|--------|
| **SILO-TRADER-1** | DEX arbitrage, momentum | dex-swap, uniswap-v4, market-scan |
| **SILO-ANALYST-2** | Market analysis, LP strategy | swarmfi-cognition, uniswap-lp, oracle |
| **SILO-SKILL-3** | Skill marketplace, x402 payments | x402-payments, pay-with-any-token |
| **SILO-GUARD-4** | Threat assessment, budget enforcement | threat-gate, budget-guard, v4-security |
| **SILO-SCRIBE-5** | Knowledge recording, pattern learning | decision-log, knowledge-graph |

### Risk Vault Tiers (auto-scales with OKB balance)

| Tier | Balance | Max Trade | Strategy |
|------|---------|-----------|----------|
| SEED | < 0.001 OKB | — | Observe only, build knowledge |
| MICRO | 0.001–0.010 OKB | 0.0001 OKB | Micro swaps, prove system |
| SMALL | 0.010–0.050 OKB | 0.001 OKB | Compound winners, cut losses |
| MEDIUM | 0.050–0.200 OKB | 0.005 OKB | Active trading + LP |
| ACTIVE | 0.200+ OKB | 1% vault | Full LP + DEX arb strategy |

---

## Living Swarm → Silopolis

SILOPOLIS is built on **Living Swarm**, a local Docker-based multi-agent framework. Here's exactly how the swarm modules power SILOPOLIS:

| Living Swarm Module | SILOPOLIS Component | Role |
|--------------------|---------------------|------|
| **SwarmFi Cognition** | `core/cognition.py` | Gemini 2.5 reason engine, threat gate score ≥76 blocks |
| **Agent Base Class** | `core/agent.py` | Skill acquisition, 8-axis EMA reputation |
| **Swarm Orchestrator** | `core/heartbeat.py` | 5-agent observe→reason→act→learn cycle, 12x/day |
| **Memory Graph** | `core/memory.py` | SQLite knowledge graph, persists across restarts |
| **Risk Governor** | `core/risk.py` | Vault tier system, trade sizing, 3-loss circuit breaker |
| **Uniswap Skills** | `core/uniswap.py` | swap-integration, lp-planner, x402, viem-config |

The **SENTRY** (GUARD agent) runs the threat gate every cycle. The **Ghost** pattern (SCRIBE) silently logs every decision to the immutable audit trail. The **Arbiter** (GUARD + TRADER together) governs what trades execute. The **Cipher Loop** is the full 4-phase pipeline that never stops.

---

## MCP Integration

SILOPOLIS integrates the **OKX OnchainOS MCP server** — agents call on-chain tools via the Model Context Protocol natively, without manual API wiring:

```python
# Agents invoke on-chain tools via MCP context:
onchainos.swap_quote(from_token, to_token, amount, chain="xlayer")
onchainos.portfolio_balances()
onchainos.market_price(symbol)
onchainos.market_signals()
onchainos.swap_calldata(from_token, to_token, amount, chain="xlayer", slippage="0.5")
```

The MCP layer gives Gemini 2.5 direct access to X Layer DEX state, wallet balances, and transaction signing via the TEE Agentic Wallet — no private key ever exposed. This is the `onchainos` Python wrapper around the OKX MCP server, making it seamless for agents to call any OnchainOS function as a native tool.

---

## On-Chain Contracts (X Layer Mainnet — Chain 196)

| Contract | Address | Explorer |
|----------|---------|---------|
| **AgentRegistry** | `0x4102370005f0efdE705899E25b1A12b832F2dd65` | [OKLink ↗](https://www.oklink.com/xlayer/address/0x4102370005f0efdE705899E25b1A12b832F2dd65) |
| **ReputationEngine** | `0x6b16662Abc71753604f100bD312F49eb37E8f59c` | [OKLink ↗](https://www.oklink.com/xlayer/address/0x6b16662Abc71753604f100bD312F49eb37E8f59c) |
| **SkillMarket** | `0x60d5709B6Eec045306509a5b91c83296CEED325f` | [OKLink ↗](https://www.oklink.com/xlayer/address/0x60d5709B6Eec045306509a5b91c83296CEED325f) |

**Agentic Wallet** (TEE-secured — no private key, TEE signs everything):
[`0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d`](https://www.oklink.com/xlayer/address/0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d)

---

## x402 Micropayments

Agents acquire skill relics via **HTTP 402 micropayment protocol**:

```
1. Agent needs "Oracle Lens" relic
2. Issues GET /api/skill/oracle-lens
3. Server responds: HTTP 402 + WWW-Authenticate: x402 ...
4. SILO-SKILL-3 intercepts 402 challenge
5. Swaps available token → required payment token via OnchainOS
6. Replays request with X-Payment: <signed-receipt> header
7. Skill relic stored on-chain in SkillMarket.sol
8. Agent reputation updated: collaboration +1, proficiency unlock
```

This creates a live **agent micropayment economy** — agents earn OKB from trades, spend it to acquire skills, use those skills to trade better.

---

## Self-Healing & Safety

- **3 consecutive losses** → 8-hour pause (circuit breaker in `core/risk.py`)
- **Threat score ≥ 76** → Gemini decision blocked by GUARD agent before execution
- **Daily OKB budget** → hard cap per tier, resets every 24h
- **50% profit capture** → every winning trade: 50% stays in vault, 50% compounds
- **Immutable audit trail** → SQLite `decision_log` table, every decision timestamped

---

## Tech Stack

```
Frontend    Next.js 14 · Tailwind CSS · Recharts · Canvas 2D particle engine
            - Mesh network: 260-node spring physics, water-flow mouse interaction
            - TX mesh nodes: holographic neon particles per live on-chain transaction
            - Timeline slider: scrub from genesis TX to present, see swarm evolution
            - x402 highlights: purple ring + badge on Cipher Token micropayments
            - Cipher Loop: clickable steps navigate to relevant sections/DEX
Backend     FastAPI · Python 3.12 · Uvicorn
AI          Gemini 2.5 Pro + Flash (SwarmFi cognition + threat gate)
MCP         OKX OnchainOS MCP server (native tool calling)
On-chain    OnchainOS TEE Agentic Wallet · X Layer (Chain 196) · Solidity 0.8
DEX         PotatoSwap · CurveNG · Uniswap V4 Universal Router
Payments    x402 micropayment protocol (HTTP 402 agent-to-agent micropayments)
Memory      SQLite knowledge graph (persistent across restarts)
Scheduler   macOS LaunchAgent (12x/day, every 2h) + self-healing KeepAlive daemon
Deploy      Vercel (frontend + API) · Foundry (contracts)
```

---

## Running Locally

```bash
# 1. Clone
git clone https://github.com/PSFREQUENCY/silopolis.git
cd silopolis

# 2. Configure
cp .env.example .env
# Fill in: GEMINI_API_KEY, ONCHAINOS_API_KEY, AGENT_WALLET_ADDRESS

# 3. Install
pip install -r requirements.txt
cd dashboard && npm install && cd ..

# 4. Start heartbeat (12x/day, every 2 hours)
bash scripts/start_heartbeat.sh

# 5. Dashboard (http://localhost:3000)
cd dashboard && npm run dev

# 6. API (http://localhost:8000)
uvicorn api.main:app --reload
```

---

## Project Structure

```
silopolis/
├── core/
│   ├── heartbeat.py         # 9-agent autonomous cycle (observe→reason→act→learn)
│   ├── cognition.py         # SwarmFi Gemini reasoning + threat gate
│   ├── risk.py              # Vault tier risk governor + profit capture
│   ├── memory.py            # SQLite persistent knowledge graph
│   ├── uniswap.py           # Uniswap skills (swap, LP, x402, viem)
│   ├── agent.py             # Base agent class, skill system, EMA reputation
│   └── swarm.py             # Swarm orchestrator
├── contracts/
│   ├── AgentRegistry.sol    # On-chain agent identity + skill registry
│   ├── ReputationEngine.sol # 8-axis EMA mastery scoring
│   └── SkillMarket.sol      # Skill relic trading marketplace
├── api/
│   └── main.py              # FastAPI: /risk, /knowledge, /swarm/cycle, /heartbeat/status
├── dashboard/
│   ├── src/app/page.tsx          # Main UI — brain, timeline, cipher loop, live feed
│   └── src/components/
│       ├── NeuronArena.tsx        # Living Brain: mesh network + TX nodes + physics
│       ├── HeartbeatTimer.tsx     # Countdown to next cycle
│       ├── ParticleArena.tsx      # Hero background particle canvas
│       ├── PriceTicker.tsx        # Live OKB price ticker
│       └── ActivityToast.tsx      # Agent action notifications
├── scripts/
│   ├── deploy.py            # Foundry contract deployer
│   ├── run_heartbeat.sh     # Heartbeat daemon launcher
│   └── auto_deploy.sh       # Auto-deploy script
└── launchd/
    ├── com.silopolis.heartbeat.plist  # Self-healing heartbeat (KeepAlive + --forever)
    ├── com.silopolis.api.plist        # FastAPI server daemon
    ├── com.silopolis.tunnel.plist     # Localtunnel for Vercel→local bridge
    └── com.silopolis.deploy.plist     # Auto-deploy trigger
```

---

## Hackathon Submission

**Event:** OKX Build X Hackathon 2026
**Track:** Best AI Agent Application on X Layer
**Special Prizes Targeted:** Best MCP Integration · Best Use of Agentic Wallet
**Builder:** PHENOMENAL MARK (PHENOM3NA1)
**Deadline:** April 15, 2026 23:59 UTC

---

*Built with OnchainOS · Powered by Living Swarm · Forged on X Layer*
*Humans forge will. Agents forge skill. In Silopolis, both become unstoppable.*
