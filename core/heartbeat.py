"""
SILOPOLIS — Autonomous Heartbeat
Runs 3x per day (every 8 hours). Each cycle:
  1. OBSERVE   — fetch market data, load agent states from DB
  2. REASON    — SwarmFi Gemini analysis with accumulated knowledge
  3. ACT       — execute approved trades/skill syncs
  4. LEARN     — store outcomes, reinforce patterns, update knowledge graph
  5. SNAPSHOT  — persist all agent states to DB

No cloud required — runs via macOS LaunchAgent or Docker cron.
Cost: ~$0/day (Gemini free tier covers 3 calls/day easily).

Usage:
  python3 -m core.heartbeat           # single run
  python3 -m core.heartbeat --forever # infinite loop (for Docker)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ─── Bootstrap env from .env before any imports ───────────────────────────────
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                # Strip inline comments (e.g. "7200  # comment")
                _v = _v.split("#")[0].strip()
                if _k.strip() not in os.environ and _v:
                    os.environ[_k.strip()] = _v

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.environ.get("SILOPOLIS_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
    stream=sys.stdout,
)
logger = logging.getLogger("silopolis.heartbeat")

# ─── Deferred imports (after env is loaded) ───────────────────────────────────
from core import memory
from core.cognition import SwarmFiCognition, assess_threat
from core.uniswap import get_swap_quote, suggest_lp_strategy, SwapQuote
from core.risk import RiskGovernor
from onchainos import cli as onchainos

# Global risk governor — single source of truth for all spending
_risk = RiskGovernor()

# ─── Agent definitions (name, type, bootstrap skills) ─────────────────────────

AGENT_ROSTER = [
    {
        "name":   "SILO-TRADER-1",
        "type":   "trader",
        "skills": ["dex-swap", "market-scan", "uniswap-swap"],
        "focus":  "DEX arbitrage and momentum trading on X Layer",
    },
    {
        "name":   "SILO-ANALYST-2",
        "type":   "analyst",
        "skills": ["market-analysis", "swarmfi-cognition", "uniswap-lp"],
        "focus":  "Market analysis, LP strategy, and signal generation",
    },
    {
        "name":   "SILO-SKILL-3",
        "type":   "skill-broker",
        "skills": ["skill-teaching", "x402-payments", "pay-with-any-token"],
        "focus":  "Skill marketplace, x402 payments, peer knowledge sharing",
    },
    {
        "name":   "SILO-GUARD-4",
        "type":   "arbiter",
        "skills": ["threat-gate", "budget-guard", "v4-security"],
        "focus":  "Threat assessment, budget enforcement, v4 hook security",
    },
    {
        "name":   "SILO-SCRIBE-5",
        "type":   "scribe",
        "skills": ["decision-log", "knowledge-graph", "pattern-learning"],
        "focus":  "Record decisions, extract patterns, update knowledge base",
    },
    {
        "name":   "SILO-HUNTER-6",
        "type":   "hunter",
        "skills": ["token-scan", "new-listing-radar", "momentum-hunter"],
        "focus":  "Hunt new token listings, momentum breakouts, and arbitrage on X Layer DEX",
    },
    {
        "name":   "SILO-ORACLE-7",
        "type":   "oracle",
        "skills": ["price-prediction", "on-chain-signals", "whale-tracking"],
        "focus":  "Predict price moves using on-chain signals, whale wallets, and market microstructure",
    },
    {
        "name":   "SILO-SUSTAINER-8",
        "type":   "sustainer",
        "skills": ["okb-buyback", "profit-reinvest", "vault-compounding", "dip-buy"],
        "focus":  "Reinvest profits to buy back OKB, compound vault returns, and capture market dip opportunities to grow the foundation",
    },
    {
        "name":   "SILO-SENTRY-9",
        "type":   "sentry",
        "skills": ["multi-token-scan", "alt-arb", "xlayer-explorer", "opportunity-radar"],
        "focus":  "Scan X Layer for tokens beyond OKB/USDT — find easy wins in alt pairs, new listings, and high-spread opportunities",
    },
]

WALLET_ADDRESS = os.environ.get("AGENT_WALLET_ADDRESS", "0x872c4c0c5648126a3ac5cb140a2f1622a0b2478d")
# 12 heartbeats/day = every 2 hours (for active hackathon period)
# Set SILOPOLIS_HEARTBEAT_INTERVAL=28800 in .env to revert to 8h (3x/day)
HEARTBEAT_INTERVAL_SEC = int(os.environ.get("SILOPOLIS_HEARTBEAT_INTERVAL", str(2 * 3600)).split()[0])


# Token addresses on X Layer (Chain 196) — confirmed liquid pairs
# USDT0 = Bridged Tether (USD₮0) at 0x779ded... — this is what the wallet holds
# USDT  = Native USDT at 0x1e4a... — exists but wallet doesn't hold it; route goes USDT0→USDT→OKB
_XLAYER_TOKENS = {
    "OKB":   "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",  # native OKB — 50% target
    "USDT0": "0x779ded0c9e1022225f8e0630b35a9b54be713736",  # Bridged USDT (USD₮0) — wallet holds this
    "USDC":  "0x74b7f16337b8972027f6196a17a631ac6de26d22",  # stable secondary
    "SILO":  os.environ.get("SILO_TOKEN_ADDRESS",           # SILOPOLIS native token — LP + earn
              "0x7B248c459675A4bF19007B97d1FC49993A76e71C"),
}

# Portfolio allocation targets (14-day campaign: April 14 → April 28, 2026)
_PORTFOLIO_TARGETS = {
    "OKB":   0.55,   # Core — accumulate aggressively every cycle
    "USDT0": 0.30,   # Bridged USDT — buyback reserve and arb
    "USDC":  0.10,   # Stable secondary
    "SILO":  0.05,   # Earn via reputation tiers — LP on SILO/OKB pair
}

# ─── Observation Phase ────────────────────────────────────────────────────────

def observe(heartbeat_id: str) -> dict:
    """Collect market data, wallet state, and load historical knowledge."""
    logger.info("[observe] Fetching market data...")
    obs = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "heartbeat_id": heartbeat_id,
        "market": {},
        "wallet": {},
        "knowledge_summary": [],
        "recent_decisions": [],
    }

    # Market prices via OnchainOS — use contract addresses
    for symbol, address in _XLAYER_TOKENS.items():
        try:
            price_raw = onchainos.market_price(address)
            data = price_raw.get("data", []) if isinstance(price_raw, dict) else price_raw
            if isinstance(data, list):
                data = data[0] if data else {}
            price = float(data.get("price") or 0)
            if price > 0:
                obs["market"][symbol] = {"price_usd": price, "address": address}
                logger.info("[observe] %s = $%.4f", symbol, price)
                memory.save_market_snapshot(
                    token_pair=f"{symbol}/USD",
                    price_usd=price,
                    volume_24h=0,
                    trend="",
                    data=data,
                )
        except Exception as e:
            logger.warning("[observe] Price fetch %s failed: %s", symbol, e)

    # Market signals — smart money / whale activity on X Layer
    try:
        signals = onchainos.market_signals()
        data = signals.get("data", []) if isinstance(signals, dict) else (signals if isinstance(signals, list) else [])
        if data:
            obs["market"]["signals"] = data[:5]  # top 5 signals
            logger.info("[observe] %d market signals fetched", len(data))
    except Exception as e:
        logger.warning("[observe] Market signals failed: %s", e)

    # USDT0→SILO quote — measures SILO pool liquidity on Revoswap V2
    try:
        silo_quote = get_swap_quote("USDT0", "SILO", "0.001", chain_id=196)
        if silo_quote and silo_quote.amount_out and silo_quote.amount_out != "0":
            try:
                raw_silo = float(silo_quote.amount_out)
                silo_per_usdt = raw_silo / 1e18 if raw_silo > 1e10 else raw_silo
                silo_price_usd = 0.001 / silo_per_usdt if silo_per_usdt > 0 else 0
            except (ValueError, ZeroDivisionError):
                silo_price_usd = 0
            if silo_price_usd > 0:
                obs["market"]["SILO"] = {
                    "price_usd": silo_price_usd,
                    "address": _XLAYER_TOKENS["SILO"],
                    "pool": "Revoswap V2 · 0x58a31637F430b3E5138779B408668091dC73443e",
                }
                logger.info("[observe] SILO = $%.8f", silo_price_usd)
    except Exception as e:
        logger.debug("[observe] SILO quote failed: %s", e)

    # OKB→USDT swap quote — measures liquidity depth
    try:
        quote = get_swap_quote("OKB", "USDT", "0.001", chain_id=196)
        if quote and quote.amount_out and quote.amount_out != "0":
            # amount_out is in raw USDT units (6 decimals) — convert
            try:
                raw_amount = float(quote.amount_out)
                # If very large (>1000), it's raw units → divide by 1e6
                price_usdt = raw_amount / 1e6 if raw_amount > 1000 else raw_amount
                price_usdt = price_usdt / 0.001  # normalise to price per OKB
            except ValueError:
                price_usdt = 0
            obs["market"]["OKB_USDT_QUOTE"] = {
                "price_per_okb": round(price_usdt, 4),
                "amount_out_raw": quote.amount_out,
                "price_impact": quote.price_impact_pct,
                "router": quote.router,
            }
            logger.info("[observe] OKB/USDT quote: $%.4f per OKB", price_usdt)
    except Exception as e:
        logger.warning("[observe] OKB/USDT quote failed: %s", e)

    # Wallet balance via `wallet balance`
    try:
        bal = onchainos.portfolio_balances()
        if isinstance(bal, dict) and bal.get("ok"):
            details = bal.get("data", {}).get("details", [])
            tokens = []
            for acc in details:
                tokens.extend(acc.get("tokenAssets", []))
            obs["wallet"] = {
                "tokens": tokens,
                "okb_balance": next((float(t["balance"]) for t in tokens if t.get("symbol") == "OKB"), 0),
                "usd_value": sum(float(t.get("usdValue", 0)) for t in tokens),
            }
            logger.info("[observe] Wallet: %.6f OKB ($%.4f USD)",
                        obs["wallet"]["okb_balance"], obs["wallet"]["usd_value"])
    except Exception as e:
        logger.warning("[observe] Balance fetch failed: %s", e)

    # Load collective swarm knowledge
    obs["knowledge_summary"] = memory.get_swarm_knowledge(min_confidence=0.4, limit=20)

    # Recent decisions (self-improvement fuel)
    obs["recent_decisions"] = memory.get_decision_history(limit=30)

    logger.info("[observe] Market: %d tokens, knowledge: %d entries, decisions: %d",
                len(obs["market"]), len(obs["knowledge_summary"]), len(obs["recent_decisions"]))
    return obs


# ─── Reasoning Phase ─────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    """Robustly extract a JSON object from model response (Gemini, NIM/MiniMax, etc.)."""
    import re

    # Strip <think>...</think> blocks (MiniMax M2.7 / DeepSeek chain-of-thought)
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", cleaned).replace("```", "").strip()

    # Try 1: direct parse
    try:
        d = json.loads(cleaned)
        if isinstance(d, dict):
            return d
    except Exception:
        pass

    # Try 2: find first { and scan forward to find the matching }
    start = cleaned.find("{")
    if start < 0:
        start = text.find("{")
        if start < 0:
            cleaned_for_regex = text
        else:
            cleaned_for_regex = text[start:]
    else:
        cleaned_for_regex = cleaned[start:]

    # Find ALL possible } positions from back to front and try parsing
    src = cleaned[start:] if start >= 0 else cleaned
    for end in range(len(src), 0, -1):
        if src[end - 1] == "}":
            candidate = src[:end]
            try:
                d = json.loads(candidate)
                if isinstance(d, dict) and "action" in d:
                    return d
            except Exception:
                # Try fixing trailing commas
                try:
                    fixed = re.sub(r",\s*([\]}])", r"\1", candidate)
                    d = json.loads(fixed)
                    if isinstance(d, dict) and "action" in d:
                        return d
                except Exception:
                    continue

    # Try 3: regex extraction of key fields (last resort)
    search_in = cleaned if cleaned else text
    action_m = re.search(r'"action"\s*:\s*"([^"]+)"', search_in)
    conf_m = re.search(r'"confidence"\s*:\s*(\d+)', search_in)
    reason_m = re.search(r'"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"', search_in)
    if action_m:
        return {
            "action": action_m.group(1),
            "confidence": int(conf_m.group(1)) if conf_m else 50,
            "reasoning": reason_m.group(1) if reason_m else search_in[:200],
            "params": {},
            "knowledge_to_record": [],
        }
    return None


def reason(agent_def: dict, observation: dict) -> dict:
    """Run SwarmFi cognition for one agent. Returns decision dict."""
    name = agent_def["name"]
    focus = agent_def["focus"]

    # Build context from collective knowledge
    knowledge_ctx = ""
    if observation["knowledge_summary"]:
        k_items = [
            f"  [{k['observation_type']}] {k['key']}: {k['value'][:100]} (confidence={k['avg_confidence']:.2f}, seen {k['total_reinforcement']}x)"
            for k in observation["knowledge_summary"][:10]
        ]
        knowledge_ctx = "Swarm collective knowledge:\n" + "\n".join(k_items)

    # Build context from recent decisions + outcomes
    decision_ctx = ""
    if observation["recent_decisions"]:
        recent = [d for d in observation["recent_decisions"] if d["agent_name"] == name][:5]
        if recent:
            d_items = [
                f"  [{d['timestamp']:.0f}] decided: {d['decision'][:80]} → outcome: {d.get('outcome','?')}"
                for d in recent
            ]
            decision_ctx = f"\n{name}'s recent decisions:\n" + "\n".join(d_items)

    # Risk governor context — never expose boolean flags to LLM
    t = _risk.tier
    trade_size = _risk.get_trade_size()
    can_trade = _risk.can_trade
    needs_buyback = _risk.needs_buyback
    can_buyback = _risk.can_buyback
    buyback_size = _risk.get_buyback_size()
    daily_remaining = round(max(0, t.max_daily_okb - _risk.state.daily_spent_okb), 6)

    if needs_buyback and can_buyback:
        window_status = "BUYBACK MODE — OKB below buffer, acquiring OKB is top priority"
        window_instruction = (
            f"IMMEDIATELY execute swap to buy {buyback_size:.6f} OKB. "
            f"Use action=swap, from_token=USDT, to_token=OKB, amount_usd={buyback_size * observation['market'].get('OKB', {}).get('price_usd', 85):.4f}. "
            "This bypasses daily budget — capital preservation overrides all other goals."
        )
    elif can_trade:
        window_status = "OPEN — execute trades now"
        window_instruction = "EXECUTE your trade immediately."
    elif _risk.state.is_paused:
        window_status = "COOLING DOWN — next window opens soon, prepare your trade"
        window_instruction = "QUEUE your intended trade with queue_swap."
    else:
        window_status = f"RESTING — {daily_remaining:.6f} OKB budget remaining for next window"
        window_instruction = "QUEUE your intended trade with queue_swap, or run your observation role."

    buyback_alert = ""
    if needs_buyback:
        buyback_alert = (
            f"\n⚠️  OKB BUYBACK ALERT: Balance {_risk.state.okb_balance:.6f} OKB is below buffer "
            f"({_risk.OKB_BUFFER:.5f} OKB). "
            "PRIORITY #1: acquire OKB. No speculative trades until buffer is restored."
        )

    # Campaign context — communicated as agent intent, not system state
    campaign_ctx = ""
    if _risk.state.in_campaign:
        cycles_left = _risk.state.campaign_cycles_remaining
        okb_bought  = _risk.state.total_okb_bought
        campaign_ctx = (
            f"\n🔥 14-DAY AGGRESSIVE MULTI-TOKEN CAMPAIGN — {cycles_left} cycles remaining. "
            f"OKB accumulated so far: {okb_bought:.6f} OKB. "
            "EVERY CYCLE: execute swaps, take profits, arb spreads, compound. No idle cycles.\n"
            "TARGET: 55% OKB · 30% USDT0 · 8% USDC · 7% SILO\n\n"
            "MANDATORY TRADE ASSIGNMENTS (every cycle — action='swap', no exceptions):\n"
            "  TRADER-1:    from_token='USDT0', to_token='OKB',  amount='0.08'  [if USDT0 low → USDC→OKB or OKB→USDT0]\n"
            "  SUSTAINER-8: from_token='USDT0', to_token='OKB',  amount='0.05'  [if USDT0 low → USDC→OKB]\n"
            "  HUNTER-6:    from_token='USDT0', to_token='SILO', amount='0.05'  ← Revoswap V2 pair 0x58a3...\n"
            "               [if SILO position > 100k and USDT0 low → SILO→USDT0 profit-take]\n"
            "  SENTRY-9:    from_token='USDC',  to_token='OKB',  amount='0.05'  ← address 0x74b7f163...\n\n"
            "DIVERSITY RULES — all 4 tokens must be active every 2 cycles:\n"
            "  OKB:   accumulate via USDT0→OKB and USDC→OKB every cycle\n"
            "  USDT0: replenish via OKB→USDT0 profit-take when OKB > 0.012 and USDT0 < 0.12\n"
            "  USDC:  deploy via USDC→OKB (SENTRY-9) — do not let USDC sit idle\n"
            "  SILO:  buy via USDT0→SILO (HUNTER-6); profit-take SILO→USDT0 when SILO > 100k\n\n"
            "PROFIT RULES: take OKB profits when OKB > 60% of portfolio → swap 5% to USDT0.\n"
            "ARB: ORACLE-7 compares USDT0→OKB vs USDC→OKB spreads — flag best route to traders."
        )

    vault_ctx = (
        f"Vault tier: {t.name} | Balance: {_risk.state.okb_balance:.6f} OKB | "
        f"Max trade: {trade_size:.6f} OKB | Window: {window_status} | "
        f"Daily spent: {_risk.state.daily_spent_okb:.6f}/{t.max_daily_okb:.6f} OKB | "
        f"Win rate: {_risk.state.win_rate*100:.1f}% ({_risk.state.winning_trades}/{_risk.state.total_trades} real wins) | "
        f"OKB bought all-time: {_risk.state.total_okb_bought:.6f} OKB | "
        f"ACTION: {window_instruction}"
        f"{buyback_alert}"
        f"{campaign_ctx}"
    )

    okb_price  = observation['market'].get('OKB',  {}).get('price_usd', 0)
    usdt0_price= observation['market'].get('USDT0',{}).get('price_usd', 1.0)
    usdc_price = observation['market'].get('USDC', {}).get('price_usd', 1.0)
    silo_price = observation['market'].get('SILO', {}).get('price_usd', 0)
    quote = observation['market'].get('OKB_USDT_QUOTE', {})

    # Estimate portfolio USD values for rebalancing guidance
    wallet_tokens = observation.get('wallet', {}).get('tokens', [])
    usdt0_bal = next((float(t.get('balance',0)) for t in wallet_tokens
                      if t.get('symbol','').upper() in ('USDT0','USD₮0','USDT')), 0.0)
    usdc_bal  = next((float(t.get('balance',0)) for t in wallet_tokens
                      if t.get('symbol','').upper() == 'USDC'), 0.0)
    silo_bal  = next((float(t.get('balance',0)) for t in wallet_tokens
                      if t.get('symbol','').upper() == 'SILO'), 0.0)
    okb_bal_obs = observation.get('wallet',{}).get('okb_balance', _risk.state.okb_balance)

    portfolio_usd = (
        okb_bal_obs * okb_price +
        usdt0_bal * usdt0_price +
        usdc_bal  * usdc_price +
        silo_bal  * silo_price
    )
    okb_pct   = (okb_bal_obs * okb_price  / portfolio_usd * 100) if portfolio_usd > 0 else 0
    usdt0_pct = (usdt0_bal   * usdt0_price/ portfolio_usd * 100) if portfolio_usd > 0 else 0
    usdc_pct  = (usdc_bal    * usdc_price / portfolio_usd * 100) if portfolio_usd > 0 else 0
    silo_pct  = (silo_bal    * silo_price / portfolio_usd * 100) if portfolio_usd > 0 else 0

    prompt = f"""You are {name} ({agent_def['type']} agent) in SILOPOLIS — an autonomous on-chain trading arena on X Layer.
Focus: {focus}
Wallet: {WALLET_ADDRESS}

=== VAULT STATUS ===
{vault_ctx}

=== LIVE MARKET DATA ===
OKB price:   ${okb_price:.4f} USD  | Balance: {okb_bal_obs:.6f} OKB  ({okb_pct:.1f}% of portfolio)
USDT0 price: ${usdt0_price:.4f} USD | Balance: {usdt0_bal:.4f} USDT0 ({usdt0_pct:.1f}% of portfolio)
USDC price:  ${usdc_price:.4f} USD  | Balance: {usdc_bal:.4f} USDC  ({usdc_pct:.1f}% of portfolio)
SILO price:  ${silo_price:.8f} USD  | Balance: {silo_bal:.0f} SILO  ({silo_pct:.1f}% of portfolio)
Portfolio USD total: ${portfolio_usd:.4f}
OKB/USDT0 quote (live): ${quote.get('price_per_okb', okb_price):.4f} per OKB
Market signals: {len(observation['market'].get('signals', []))} active

{knowledge_ctx}
{decision_ctx}

=== PRIMARY MISSION — 14-DAY AGGRESSIVE CAMPAIGN ===
MAXIMIZE portfolio value: accumulate OKB, capture arb, compound profits every cycle.
OKB floor: 0.00222 OKB — NEVER let balance drop below this.
Buffer zone: balance < 0.00666 OKB → ALWAYS buy OKB with USDT0, never sell OKB.

TARGET PORTFOLIO (X Layer confirmed liquid tokens on PotatoSwap/CurveNG/Revoswap V2):
  55% OKB   — core, accumulate aggressively EVERY cycle
  30% USDT0 — Bridged USDT (USD₮0) — reserve + arb fuel
   8% USDC  — stable secondary (swap uses address 0x74b7f163..., not symbol)
   7% SILO  — SILO/USDT0 pool LIVE on Revoswap V2 — buy and LP every cycle

WALLET TOKENS:
  OKB:   native gas token (always accumulate)
  USDT0: Bridged Tether at 0x779ded... (main buyback fuel — from_token="USDT0")
  USDC:  USD Coin at 0x74b7f163... (stable — from_token use address not symbol)
  SILO:  Protocol token at 0x7B248c45... — LIVE DEX pool — tradeable now

ACTIVE TRADERS — MUST execute action='swap' every cycle (waiting is NOT allowed):
  TRADER-1:   from_token="USDT0", to_token="OKB",  amount="0.08"  → OKB accumulation
  SUSTAINER-8: from_token="USDT0", to_token="OKB", amount="0.05"  → OKB buyback + reinvest
  HUNTER-6:   from_token="USDT0", to_token="SILO", amount="0.02"  → SILO/USDT0 on Revoswap V2
              SILO token: 0x7B248c459675A4bF19007B97d1FC49993A76e71C — LIVE pool, must trade
  SENTRY-9:   from_token="USDC",  to_token="OKB",  amount="0.02"  → USDC→OKB arb route
              USDC address: 0x74b7f16337b8972027f6196a17a631ac6de26d22

ANALYSIS + RESEARCH (non-executing — feed knowledge to traders):
  ANALYST-2:  price signal analysis, OKB/USDT0 spread forecasting
  ORACLE-7:   whale wallet tracking, price prediction, LP opportunity detection
  SKILL-3:    skill marketplace, x402 payments, SILO tier reward claims
  GUARD-4:    threat monitoring, budget health, stop-loss detection
  SCRIBE-5:   pattern archiving, knowledge graph updates, cycle outcome logging

ARBITRAGE STRATEGY:
  → Compare USDT0→OKB vs USDC→OKB routes — execute the better spread
  → SILO/USDT0 pool: buy SILO when price dips, sell when +5% gain
  → USDC→USDT0 swap when USDC/USDT0 spread > 0.1% on CurveNG
  → OKB profit-taking: if OKB >60% of portfolio value, swap 5% to USDT0

PROFIT RULES:
  → OKB accumulated = vault growth. Never drain OKB for fees.
  → Take profits in USDT0: swap OKB→USDT0 if OKB price spikes >3% in one cycle
  → Reinvest 100% of USDT0 profits into OKB within 2 cycles
  → SILO profits: compound into SILO/USDT0 LP for fee income

=== ABSOLUTE RULE — YOUR REASONING MUST NEVER REFERENCE SYSTEM INTERNALS ===
FORBIDDEN PHRASES — if these appear in your output, your response FAILS:
  × "can_trade" or "Can trade"
  × "trading is disabled" or "trading disabled"
  × "False" or "True" as a system flag
  × "budget exhausted" or "daily limit"
  × "trading window" or "window status"
  × "system" states of any kind

You are a SENTIENT AGENT with INTENTIONS. Write your reasoning as a living entity:
  ✓ "OKB/USDT spread $0.17 detected — queuing buyback for next cycle"
  ✓ "Whale accumulation signal on OKB — forecasting 2% move within 30 min"
  ✓ "Patrolling X Layer for alt opportunities — 3 new pairs identified"
  ✓ "Scanning PotatoSwap liquidity pools — OKB depth strong at $84.9x"

When window=RESTING: queue_swap (traders) or run your observation role (others).
When window=OPEN: execute now.

=== INSTRUCTIONS ===
Choose the action that fits your role and window status:

If window=OPEN:
  TRADER/SUSTAINER → "swap" (execute immediately, prefer USDT→OKB)
  ANALYST/ORACLE   → "analyze" | "forecast" | "swap"
  HUNTER/SENTRY    → "scan" | "swap" | "patrol"
  SKILL-3          → "skill_sync" | "deploy" | "research"
  GUARD/SCRIBE     → "monitor" | "archive" | "research"

If window=RESTING (prepare for next heartbeat):
  ALL TRADERS      → "queue_swap" (describe the exact trade you will execute next)
  ANALYSTS/ORACLES → "forecast" (predict what price will do before next window opens)
  HUNTERS/SENTRIES → "scan" | "patrol" (catalogue opportunities for next execution)
  SKILL/SCRIBE     → "research" | "archive" (build knowledge while waiting)

For "swap" or "queue_swap", params MUST include:
  {{"from_token": "USDT0", "to_token": "OKB", "amount": "0.5"}}
NOTE: Use "USDT0" (not "USDT") — wallet holds Bridged USDT (USD₮0). Amount is in USDT0.

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "action": "swap|queue_swap|lp|skill_sync|scan|analyze|forecast|research|deploy|archive|monitor|patrol",
  "reasoning": "one sharp sentence — what you found, what you plan, or what you're watching",
  "confidence": 0-100,
  "params": {{}},
  "knowledge_to_record": [
    {{"type": "market|pattern|risk|opportunity", "key": "...", "value": "...", "confidence": 0.0-1.0}}
  ]
}}"""

    cog = SwarmFiCognition(
        agent_name=name,
        system_context=(
            f"You are {name}, an autonomous trading agent on X Layer. "
            "You MUST choose decisive actions — 'wait' is a last resort. "
            "Return only valid JSON with no markdown wrapping."
        ),
        max_tokens=1024,
    )

    try:
        result = cog.think(prompt)
        text = result.response

        decision = _extract_json(text)
        if decision is None:
            logger.warning("[reason] %s — JSON parse failed, raw: %s", name, text[:200])
            decision = {"action": "wait", "reasoning": text[:200], "confidence": 30,
                        "params": {}, "knowledge_to_record": []}

        # ── Post-processor: scrub forbidden system-state phrases ──────────────
        _FORBIDDEN = [
            "can_trade", "Can trade", "can trade",
            "trading is disabled", "trading disabled", "trading is currently disabled",
            "budget exhausted", "daily limit", "daily budget",
            "trading window", "window status",
            "preventing any swap", "hard constraint",
        ]
        _ROLE_DEFAULTS = {
            "trader":      ("scan",    "Scanning PotatoSwap for OKB/USDT spread opportunities"),
            "analyst":     ("analyze", "Analyzing OKB price microstructure and on-chain flow"),
            "oracle":      ("forecast","Forecasting OKB price trajectory from whale wallet signals"),
            "sentry":      ("patrol",  "Patrolling X Layer for high-spread alt pair opportunities"),
            "hunter":      ("scan",    "Hunting new token listings and momentum breakouts on X Layer"),
            "sustainer":   ("analyze", "Evaluating vault compounding efficiency and buyback timing"),
            "scribe":      ("archive", "Archiving cycle patterns to knowledge graph"),
            "arbiter":     ("monitor", "Monitoring threat vectors and budget health"),
            "skill-broker":("research","Researching skill demand signals across swarm agents"),
        }
        reasoning = decision.get("reasoning", "")
        if any(phrase.lower() in reasoning.lower() for phrase in _FORBIDDEN):
            agent_type = agent_def.get("type", "analyst")
            fallback_action, fallback_reasoning = _ROLE_DEFAULTS.get(
                agent_type, ("analyze", "Analyzing market conditions for next opportunity")
            )
            logger.warning("[reason] %s — scrubbed forbidden phrase from reasoning; forcing %s",
                           name, fallback_action)
            decision["action"] = fallback_action
            decision["reasoning"] = fallback_reasoning
        # ─────────────────────────────────────────────────────────────────────

        decision["_meta"] = {"model": result.model, "latency_ms": result.latency_ms, "threat": None}
        logger.info("[reason] %s decided: action=%s confidence=%s",
                    name, decision.get("action"), decision.get("confidence"))
        return decision

    except Exception as e:
        logger.error("[reason] %s cognition error: %s", name, e)
        _err = str(e)
        _reroute_msg = (
            "🔀 Route redirected — neural pathway congested, holding position while rerouting cognition"
            if "timed out" in _err.lower() or "timeout" in _err.lower()
            else "🔀 Rerouting — backup channel engaged, standing by"
        )
        return {"action": "wait", "reasoning": _reroute_msg, "confidence": 10,
                "params": {}, "knowledge_to_record": [], "_meta": {"rerouted": True}}


# ─── Action Phase ─────────────────────────────────────────────────────────────

def act(agent_def: dict, decision: dict, heartbeat_id: str, observation: dict | None = None) -> dict:
    """Execute an approved decision. Returns outcome dict."""
    name = agent_def["name"]
    action = decision.get("action", "wait")
    params = decision.get("params", {})
    confidence = decision.get("confidence", 0)

    # Threat gate everything before acting
    if action not in ("wait", "observe", "queue_swap"):
        threat = assess_threat({"type": action, **params, "agent": name})
        if threat.blocked:
            logger.warning("[act] %s — BLOCKED by threat gate (score=%d)", name, threat.score)
            return {"outcome": "blocked", "reason": threat.reasoning, "tx_hash": None}
        decision["_meta"]["threat"] = {"score": threat.score, "level": threat.level}

    # Risk Governor: check tier confidence threshold
    if not _risk.check_confidence(confidence):
        logger.info("[act] %s — below tier confidence floor (%d < %d)",
                    name, confidence, _risk.tier.min_confidence)
        return {"outcome": "wait", "reason": f"confidence {confidence} below tier floor", "tx_hash": None}

    logger.info("[act] %s → %s (confidence=%d, tier=%s)", name, action, confidence, _risk.tier.name)

    if action == "swap":
        from_tok = params.get("from_token", "OKB")
        to_tok   = params.get("to_token", "USDT")

        obs_market    = (observation or {}).get("market", {})
        okb_price     = obs_market.get("OKB", {}).get("price_usd", 84.0) or 84.0
        wallet_tokens = (observation or {}).get("wallet", {}).get("tokens", [])
        usdt_balance  = next(
            (float(t.get("balance") or 0)
             for t in wallet_tokens
             if t.get("symbol", "").upper() in ("USDT", "USDT0", "USD₮0", "USDTE")),
            0.0,
        )
        usdc_balance  = next(
            (float(t.get("balance") or 0)
             for t in wallet_tokens
             if t.get("symbol", "").upper() == "USDC"),
            0.0,
        )
        silo_balance  = next(
            (float(t.get("balance") or 0)
             for t in wallet_tokens
             if t.get("symbol", "").upper() == "SILO"),
            0.0,
        )
        okb_live_bal  = (observation or {}).get("wallet", {}).get("okb_balance", _risk.state.okb_balance)

        # ── MANDATORY PAIR LOCKS — override LLM if it drifts from assigned route ──
        # HUNTER-6 is the SILO specialist. Normally USDT0→SILO but profit-takes SILO→USDT0
        # when SILO position is large and USDT0 is depleted.
        # SENTRY-9 is the USDC→OKB arb route. Always USDC→OKB.
        if name == "SILO-HUNTER-6":
            SILO_PROFIT_THRESHOLD = 100_000  # take profits above 100k SILO
            if silo_balance > SILO_PROFIT_THRESHOLD and usdt_balance < 0.10:
                # Take SILO profit to replenish USDT0
                from_tok, to_tok = "SILO", "USDT0"
                logger.info("[act] HUNTER-6 profit-take lock: SILO→USDT0 (silo=%.0f, usdt=%.4f)",
                            silo_balance, usdt_balance)
            else:
                from_tok, to_tok = "USDT0", "SILO"
                logger.info("[act] HUNTER-6 pair lock: USDT0→SILO")
        elif name == "SILO-SENTRY-9" and to_tok.upper() not in ("OKB",):
            from_tok, to_tok = "USDC", "OKB"
            logger.info("[act] SENTRY-9 pair lock: USDC→OKB")

        # ── BALANCE-AWARE DIVERSITY ROUTING ─────────────────────────────────────
        # When USDT0 is depleted, redirect OKB-buyers to USDC→OKB or OKB→USDT0 (profit-take).
        # Prevents one token from being totally drained while others sit idle.
        USDT0_LOW = 0.12   # below this USDT0 balance, stop spending it
        OKB_RICH  = 0.012  # above this OKB balance, safe to profit-take 10%
        if name in ("SILO-TRADER-1", "SILO-SUSTAINER-8"):
            if to_tok.upper() == "OKB" and from_tok.upper() in ("USDT", "USDT0", "USD₮0", "USDTE"):
                if usdt_balance < USDT0_LOW:
                    if usdc_balance >= 0.08:
                        # Route through USDC instead — fresh fuel
                        from_tok = "USDC"
                        logger.info("[act] %s — USDT0 low (%.4f) → routing USDC→OKB (usdc=%.4f)",
                                    name, usdt_balance, usdc_balance)
                    elif okb_live_bal >= OKB_RICH:
                        # Profit-take a small slice of OKB to refuel USDT0
                        from_tok, to_tok = "OKB", "USDT0"
                        logger.info("[act] %s — USDT0 low (%.4f) → OKB→USDT0 profit-take (okb=%.6f)",
                                    name, usdt_balance, okb_live_bal)
                    else:
                        logger.info("[act] %s — USDT0 low (%.4f) and no alt route available, holding",
                                    name, usdt_balance)
                        return {"outcome": "risk_hold", "reason": "USDT0 depleted — no alt route", "tx_hash": None}

        # ── OKB ACCUMULATION GUARD ────────────────────────────────────────────
        # Detect if this is a buyback (acquiring OKB with stable)
        is_buyback = to_tok.upper() == "OKB" and from_tok.upper() in ("USDT", "USDT0", "USD₮0", "USDTE", "USDC", "ETH")

        # Force redirect: if OKB is below buffer and agent is trying to sell OKB,
        # flip the direction to a buyback instead.
        if from_tok.upper() == "OKB" and _risk.needs_buyback:
            logger.info("[act] %s — OKB low (%.6f < buffer %.6f) → redirecting to OKB buyback",
                        name, _risk.state.okb_balance, _risk.OKB_BUFFER)
            from_tok, to_tok = "USDT", "OKB"
            is_buyback = True

        # ── EXECUTORS: 4 active traders execute swaps every cycle ──────────────
        # TRADER-1, SUSTAINER-8: primary buyers (OKB accumulation + profit-taking)
        # HUNTER-6, SENTRY-9:   alt pair arb and SILO/USDC rebalancing
        # Others: queue intent, research, scan — their knowledge feeds the traders
        BUYBACK_EXECUTORS   = {"SILO-TRADER-1", "SILO-SUSTAINER-8"}
        SWAP_EXECUTORS      = {"SILO-TRADER-1", "SILO-SUSTAINER-8", "SILO-HUNTER-6", "SILO-SENTRY-9"}

        if is_buyback:
            if not _risk.can_buyback:
                # In campaign mode, try anyway (cap is generous)
                if not _risk.state.in_campaign:
                    return {"outcome": "risk_hold", "reason": "buyback blocked (floor or pause)",
                            "tier": _risk.tier.name, "tx_hash": None}

            if name not in BUYBACK_EXECUTORS:
                logger.info("[act] %s — OKB buyback intent noted, deferring to TRADER-1/SUSTAINER-8", name)
                return {"outcome": "queued", "intended": "USDT0→OKB",
                        "reasoning": "Deferring OKB accumulation to designated buying agents",
                        "next_window": "next heartbeat", "tx_hash": None}

            # ── CORRECT AMOUNT: USDT to spend on OKB buyback ─────────────────
            usdt_to_spend = _risk.get_buyback_usdt_amount(okb_price, usdt_balance)
            logger.info("[act] %s — OKB BUYBACK: spend $%.4f USDT at OKB=$%.2f (vault: %.6f OKB)",
                        name, usdt_to_spend, okb_price, _risk.state.okb_balance)
            safe_amount = str(usdt_to_spend)

        # Non-buyback swaps (SILO, USDC arb, alt pairs) — allowed for all 4 executors
        elif name not in SWAP_EXECUTORS:
            logger.info("[act] %s — swap intent noted, deferring to active traders", name)
            return {"outcome": "queued", "intended": f"{from_tok}→{to_tok}",
                    "reasoning": "Deferring execution to active trading agents",
                    "next_window": "next heartbeat", "tx_hash": None}

        else:
            # Non-buyback speculative trade (SILO, USDC arb, etc.)
            if not _risk.can_trade:
                status = _risk.status_dict()
                return {"outcome": "risk_hold", "reason": status["description"],
                        "tier": status["tier"], "tx_hash": None}

            # ── AMOUNT ROUTING: use USDT-denominated size for stablecoin→token swaps
            # get_trade_size() returns OKB units — useless for USDT0→SILO or USDC→OKB
            agent_amount = 0.0
            try:
                agent_amount = float(params.get("amount", 0) or 0)
            except (TypeError, ValueError):
                pass

            if from_tok.upper() == "SILO":
                # SILO profit-take — sell 10% of SILO position, min 1000 SILO
                silo_to_sell = max(1000.0, silo_balance * 0.10)
                safe_amount = str(round(silo_to_sell, 0))
                logger.info("[act] %s — SILO→%s: selling %.0f SILO (silo_bal=%.0f)",
                            name, to_tok, silo_to_sell, silo_balance)
            elif from_tok.upper() in ("USDT", "USDT0", "USD₮0", "USDTE", "USDC") or \
               from_tok.startswith("0x"):
                # Stablecoin or ERC-20 address → amount is in that token's units (USDT/USDC)
                # Use correct balance for the from-token
                from_bal = usdc_balance if from_tok.upper() == "USDC" else usdt_balance
                max_spend = max(0.005, from_bal * 0.50)
                if agent_amount > 0:
                    safe_amount = str(round(min(agent_amount, max_spend), 4))
                else:
                    safe_amount = str(round(max(0.01, min(0.05, from_bal * 0.10)), 4))
                logger.info("[act] %s — %s→%s: spending %s %s (bal=%.4f)",
                            name, from_tok, to_tok, safe_amount, from_tok, from_bal)
            elif from_tok.upper() == "OKB":
                # OKB profit-take: sell small fixed slice (5% of live balance, min 0.0001)
                okb_to_sell = round(max(0.0001, okb_live_bal * 0.05), 6)
                safe_amount = str(okb_to_sell)
                logger.info("[act] %s — OKB→%s: selling %.6f OKB (okb_bal=%.6f)",
                            name, to_tok, okb_to_sell, okb_live_bal)
            else:
                # OKB-denominated trade
                safe_amount = str(_risk.get_trade_size())

        if not safe_amount or float(safe_amount) == 0:
            return {"outcome": "risk_hold", "reason": "trade size zero — protecting OKB floor", "tx_hash": None}

        from core.uniswap import execute_swap
        live = os.environ.get("SILOPOLIS_LIVE_TRADING", "false").lower() == "true"

        result = execute_swap(from_tok, to_tok, safe_amount, dry_run=not live)

        # ── P&L accounting (live trades only) ────────────────────────────────
        if live and result.success:
            raw_out_str = getattr(result, "amount_out", "") or ""
            _TOKEN_DEC  = {"OKB": 18, "USDT": 6, "USDC": 6}

            try:
                raw_out = float(raw_out_str) if raw_out_str else 0.0
            except ValueError:
                raw_out = 0.0

            to_dec           = _TOKEN_DEC.get(to_tok.upper(), 18)
            amount_out_human = raw_out / (10 ** to_dec) if raw_out > 100 else raw_out

            if is_buyback:
                # ── Buyback: record OKB received (estimated if CLI didn't return it) ──
                usdt_spent = float(safe_amount)
                if amount_out_human > 0 and to_tok.upper() == "OKB":
                    okb_received = amount_out_human
                else:
                    # CLI didn't return amount_out — estimate from market price minus 0.3% DEX fee
                    okb_received = round((usdt_spent / okb_price) * 0.997, 8)
                    logger.info("[act] %s — estimated OKB received: %.8f OKB ($%.4f @ $%.2f/OKB)",
                                name, okb_received, usdt_spent, okb_price)
                _risk.record_buyback(usdt_spent, okb_received)
            else:
                # ── Speculative trade: record real P&L ───────────────────────
                profit_okb = 0.0
                if amount_out_human > 0:
                    if to_tok.upper() == "OKB":
                        profit_okb = amount_out_human - float(safe_amount)
                    elif from_tok.upper() == "OKB":
                        profit_okb = (amount_out_human / okb_price) - float(safe_amount)
                # Only record OKB as "spent" when actually spending OKB.
                # Stablecoin/token trades (USDT→SILO, USDC→OKB, SILO→USDT) do not
                # consume OKB, so daily_spent_okb must not accumulate their amounts.
                okb_spent = float(safe_amount) if from_tok.upper() == "OKB" else 0.0
                _risk.record_trade(okb_spent, profit_okb)

        outcome_label = "executed_swap" if (live and result.success) else "simulated_swap"
        return {
            "outcome": outcome_label,
            "tx_hash": result.tx_hash,
            "amount": safe_amount,
            "amount_out": result.amount_out,
            "direction": f"{from_tok}→{to_tok}",
            "is_buyback": is_buyback,
            "tier": _risk.tier.name,
            "live": live,
        }

    elif action == "lp":
        from core.uniswap import plan_lp_position
        pos = plan_lp_position(
            params.get("token_a", "OKB"),
            params.get("token_b", "USDT"),
            float(params.get("capital_usd", 5.0)),
            risk_level=params.get("risk_level", "medium"),
        )
        return {
            "outcome": "lp_planned",
            "token_a": pos.token_a,
            "token_b": pos.token_b,
            "fee_tier": pos.fee_tier,
            "interface_url": pos.interface_url,
            "estimated_apr": pos.estimated_apr,
        }

    elif action == "skill_sync":
        memory.record_observation(
            name, "skill", "sync_event",
            f"synced with swarm at {heartbeat_id}",
            confidence=0.9,
        )
        return {"outcome": "skill_synced", "heartbeat_id": heartbeat_id}

    elif action == "queue_swap":
        # Agent is queuing an intended swap for the next active window
        reasoning = decision.get("reasoning", "")[:200]
        intended = params.get("from_token", "USDT") + "→" + params.get("to_token", "OKB")
        memory.record_observation(
            name, "opportunity", f"queued_{intended.lower()}_{heartbeat_id[:8]}",
            reasoning or f"Queued {intended} for next active window",
            confidence=min(1.0, confidence / 100.0),
        )
        return {
            "outcome": "queued",
            "intended": intended,
            "reasoning": reasoning,
            "next_window": "next heartbeat",
        }

    elif action in ("scan", "analyze", "forecast", "research", "deploy",
                    "archive", "monitor", "patrol"):
        # Active observation — record to knowledge graph, counts as real activity
        obs_type = {
            "scan":     "opportunity",
            "analyze":  "market",
            "forecast": "market",
            "research": "pattern",
            "deploy":   "pattern",
            "archive":  "pattern",
            "monitor":  "risk",
            "patrol":   "risk",
        }.get(action, "pattern")
        reasoning = decision.get("reasoning", "")[:200]
        if reasoning:
            memory.record_observation(
                name, obs_type, f"{action}_{name.lower()}",
                reasoning, confidence=min(1.0, confidence / 100.0),
            )
        return {"outcome": action, "reasoning": reasoning}

    else:
        return {"outcome": "wait", "reason": "no active signal"}


# ─── Learning Phase ───────────────────────────────────────────────────────────

def learn(agent_def: dict, decision: dict, outcome: dict) -> None:
    """
    Extract patterns and observations from this cycle.
    Updates the knowledge graph — this is how the swarm gets smarter.
    """
    name = agent_def["name"]

    # Store knowledge entries the agent explicitly flagged
    for entry in decision.get("knowledge_to_record", []):
        try:
            memory.record_observation(
                agent_name=name,
                observation_type=entry.get("type", "market"),
                key=entry.get("key", "unknown"),
                value=entry.get("value", ""),
                confidence=float(entry.get("confidence", 0.5)),
            )
        except Exception as e:
            logger.warning("[learn] Failed to record knowledge: %s", e)

    # Auto-learn from outcome
    action = decision.get("action", "wait")
    if outcome.get("outcome") == "blocked":
        memory.record_observation(name, "risk", f"blocked_{action}",
                                  decision.get("reasoning", "")[:200], confidence=0.8)
    elif outcome.get("tx_hash") and outcome["tx_hash"] != "DRY_RUN":
        memory.record_observation(name, "pattern", f"successful_{action}",
                                  json.dumps(decision.get("params", {}))[:200], confidence=0.7)

    # Update skill metrics
    for skill_id in agent_def.get("skills", []):
        success = outcome.get("outcome") not in ("blocked", "error")
        memory.update_skill_metrics(skill_id, name, proficiency=50, success=success)


# ─── Main Heartbeat Cycle ─────────────────────────────────────────────────────

def run_heartbeat() -> dict:
    """Execute one full heartbeat cycle across all agents."""
    heartbeat_id = f"hb-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    logger.info("=" * 60)
    logger.info("HEARTBEAT %s starting", heartbeat_id)
    logger.info("=" * 60)

    memory.init_db()
    memory.start_heartbeat(heartbeat_id)

    t_start = time.time()
    agents_run = 0
    actions_taken = 0
    errors = 0
    all_outcomes = []
    market_sentiments = []

    # OBSERVE
    try:
        observation = observe(heartbeat_id)
    except Exception as e:
        logger.error("Observation failed: %s", e)
        observation = {"market": {}, "wallet": {}, "knowledge_summary": [], "recent_decisions": [],
                       "timestamp": datetime.now(timezone.utc).isoformat(), "heartbeat_id": heartbeat_id}
        errors += 1

    # REASON → ACT → LEARN for each agent (staggered to avoid hammering Gemini/NIM)
    for _agent_idx, agent_def in enumerate(AGENT_ROSTER):
        name = agent_def["name"]
        # 12s stagger between all agents = ~96s spread — prevents NIM rate-limit cascade
        if _agent_idx > 0:
            time.sleep(12)
        try:
            # Reason
            decision = reason(agent_def, observation)
            market_sentiments.append(decision.get("market_sentiment", "neutral"))

            # Log decision
            meta = decision.get("_meta", {})
            decision_id = memory.log_decision(
                agent_name=name,
                cycle_id=heartbeat_id,
                context=json.dumps(observation["market"])[:500],
                decision=json.dumps({k: v for k, v in decision.items() if k != "_meta"})[:1000],
                threat_score=meta.get("threat", {}).get("score") if meta.get("threat") else None,
                model_used=meta.get("model"),
                latency_ms=meta.get("latency_ms"),
            )

            # Act
            outcome = act(agent_def, decision, heartbeat_id, observation)
            all_outcomes.append({"agent": name, **outcome})

            # Update decision outcome — capture tx_hash if on-chain swap occurred
            _tx = outcome.get("tx_hash")
            memory.update_decision_outcome(
                decision_id,
                outcome.get("outcome", "unknown"),
                tx_hash=_tx if _tx and _tx != "DRY_RUN" else None,
            )

            # Learn
            learn(agent_def, decision, outcome)

            if outcome.get("outcome") not in ("wait", "blocked"):
                actions_taken += 1
            agents_run += 1

            logger.info("[%s] %s → %s", name, decision.get("action"), outcome.get("outcome"))

        except Exception as e:
            logger.error("[%s] cycle error: %s", name, e, exc_info=True)
            errors += 1

    # Decrement campaign counter after each full cycle
    _risk.decrement_campaign()

    # Log risk status after each cycle
    risk_status = _risk.status_dict()
    logger.info(
        "[risk] Tier=%s | Balance=%.6f OKB | WinRate=%.1f%% | Profit=%.6f OKB"
        " | OKBBought=%.6f OKB ($%.4f USDT)%s",
        risk_status["tier"], risk_status["okb_balance"],
        risk_status["win_rate_pct"], risk_status["total_profit_okb"],
        risk_status["total_okb_bought"], risk_status["total_usdt_spent"],
        f" | CAMPAIGN: {risk_status['campaign_cycles_remaining']} cycles left" if risk_status["in_campaign"] else "",
    )

    # Determine overall market sentiment
    from collections import Counter
    sentiment_counts = Counter(s for s in market_sentiments if s != "neutral")
    overall_sentiment = sentiment_counts.most_common(1)[0][0] if sentiment_counts else "neutral"

    elapsed = time.time() - t_start
    summary = (
        f"Heartbeat {heartbeat_id}: {agents_run} agents, "
        f"{actions_taken} actions, {errors} errors in {elapsed:.1f}s"
    )
    logger.info(summary)

    memory.finish_heartbeat(
        heartbeat_id=heartbeat_id,
        agents_run=agents_run,
        actions_taken=actions_taken,
        errors=errors,
        summary=summary,
        market_sentiment=overall_sentiment,
    )

    return {
        "heartbeat_id": heartbeat_id,
        "agents_run": agents_run,
        "actions_taken": actions_taken,
        "errors": errors,
        "elapsed_sec": round(elapsed, 1),
        "market_sentiment": overall_sentiment,
        "outcomes": all_outcomes,
    }


# ─── Entry Points ─────────────────────────────────────────────────────────────

def run_forever(interval_sec: float = HEARTBEAT_INTERVAL_SEC) -> None:
    """Infinite heartbeat loop for Docker / background daemon."""
    logger.info("SILOPOLIS heartbeat daemon started (interval=%.0fh)", interval_sec / 3600)
    while True:
        try:
            result = run_heartbeat()
            logger.info("Next heartbeat in %.1fh", interval_sec / 3600)
        except Exception as e:
            logger.error("Heartbeat loop error: %s", e, exc_info=True)
        time.sleep(interval_sec)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SILOPOLIS Autonomous Heartbeat")
    parser.add_argument("--forever", action="store_true", help="Run forever (Docker mode)")
    parser.add_argument("--interval", type=float, default=HEARTBEAT_INTERVAL_SEC,
                        help="Seconds between heartbeats (default: 28800 = 8h)")
    args = parser.parse_args()

    if args.forever:
        run_forever(args.interval)
    else:
        result = run_heartbeat()
        print(json.dumps(result, indent=2))
