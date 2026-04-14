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


# Token addresses on X Layer (Chain 196)
_XLAYER_TOKENS = {
    "OKB":  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",  # native
    "USDT": "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
    "USDC": "0x74b7f16337b8972027f6196a17a631ac6de26d22",
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
    """Robustly extract a JSON object from Gemini response."""
    import re

    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()

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

    # Risk governor context
    t = _risk.tier
    trade_size = _risk.get_trade_size()
    can_trade = _risk.can_trade
    vault_ctx = (
        f"Vault tier: {t.name} | Balance: {_risk.state.okb_balance:.6f} OKB | "
        f"Max trade: {trade_size:.6f} OKB | Can trade: {can_trade} | "
        f"Daily spent: {_risk.state.daily_spent_okb:.6f}/{t.max_daily_okb:.6f} OKB | "
        f"Win rate: {_risk.state.win_rate*100:.1f}% ({_risk.state.total_trades} trades)"
    )

    okb_price = observation['market'].get('OKB', {}).get('price_usd', 0)
    quote = observation['market'].get('OKB_USDT_QUOTE', {})

    prompt = f"""You are {name} ({agent_def['type']} agent) in SILOPOLIS — an autonomous on-chain trading arena on X Layer.
Focus: {focus}
Wallet: {WALLET_ADDRESS}

=== VAULT STATUS ===
{vault_ctx}

=== LIVE MARKET DATA ===
OKB price: ${okb_price:.4f} USD
OKB/USDT quote (live): ${quote.get('price_per_okb', okb_price):.4f} per OKB
Market signals: {len(observation['market'].get('signals', []))} active

{knowledge_ctx}
{decision_ctx}

=== PRIMARY MISSION ===
ACCUMULATE OKB. This vault's sole purpose is to GROW OKB holdings over time.
OKB floor: 0.00222 OKB — NEVER let balance drop below this.
Buffer zone: balance < 0.00666 OKB (3x floor) → ALWAYS buy OKB with USDT, never sell.
Only sell OKB if balance > 0.01 OKB AND you see a clear profitable spread.

=== INSTRUCTIONS ===
You MUST take an action this cycle. "wait" is only valid if trading is paused or there is a clear risk signal.
If can_trade=True:
  - TRADER/SUSTAINER: prefer USDT→OKB buyback. This grows the vault.
  - ANALYST/ORACLE: assess OKB dip-buy opportunities — when price drops, it is a BUY signal.
  - HUNTER/SENTRY: find high-spread alt pairs or new listings; book profit back into OKB.
  - SKILL-BROKER: attempt a skill-sync or x402 relic acquisition.
  - GUARD: run a security check and decide if the current threat level blocks trading.
  - SCRIBE: record patterns, mark OKB accumulation events, update knowledge graph.

For a "swap" action (PREFERRED direction: USDT→OKB), params MUST include:
  {{"from_token": "USDT", "to_token": "OKB", "amount": "0.001", "dry_run": false}}

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "action": "swap|lp|skill_sync|observe|wait",
  "reasoning": "one concise sentence explaining why",
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

        decision["_meta"] = {"model": result.model, "latency_ms": result.latency_ms, "threat": None}
        logger.info("[reason] %s decided: action=%s confidence=%s",
                    name, decision.get("action"), decision.get("confidence"))
        return decision

    except Exception as e:
        logger.error("[reason] %s cognition error: %s", name, e)
        return {"action": "wait", "reasoning": f"error: {e}", "confidence": 0,
                "params": {}, "knowledge_to_record": [], "_meta": {}}


# ─── Action Phase ─────────────────────────────────────────────────────────────

def act(agent_def: dict, decision: dict, heartbeat_id: str) -> dict:
    """Execute an approved decision. Returns outcome dict."""
    name = agent_def["name"]
    action = decision.get("action", "wait")
    params = decision.get("params", {})
    confidence = decision.get("confidence", 0)

    # Threat gate everything before acting
    if action not in ("wait", "observe"):
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
        # Risk Governor gate — checks balance, daily budget, pause state
        if not _risk.can_trade:
            status = _risk.status_dict()
            return {"outcome": "risk_hold", "reason": status["description"],
                    "tier": status["tier"], "tx_hash": None}

        from_tok  = params.get("from_token", "OKB")
        to_tok    = params.get("to_token", "USDT")

        # ── OKB ACCUMULATION GUARD ────────────────────────────────────────────
        # Primary goal: grow OKB holdings. Never sell OKB unless balance is
        # safely above floor + buffer. Force buyback direction when low.
        floor = _risk.OKB_FLOOR
        bal   = _risk.state.okb_balance
        buyback_threshold = floor * 3.0   # below 3x floor → buy OKB, don't sell
        if from_tok.upper() == "OKB" and bal < buyback_threshold:
            # Redirect: buy OKB with USDT instead of selling OKB
            logger.info("[act] %s — OKB low (%.6f < %.6f buffer) → redirecting to OKB buyback",
                        name, bal, buyback_threshold)
            from_tok, to_tok = "USDT", "OKB"
            # Use a small USDT amount (proxy for what we'd spend)
            safe_amount = "0.001"   # $0.001 USDT buyback
        else:
            safe_amount = str(_risk.get_trade_size())

        if safe_amount == "0.0" or float(safe_amount) == 0:
            return {"outcome": "risk_hold", "reason": "trade size zero — protecting OKB floor", "tx_hash": None}

        from core.uniswap import execute_swap
        live = os.environ.get("SILOPOLIS_LIVE_TRADING", "false").lower() == "true"

        result = execute_swap(from_tok, to_tok, safe_amount, dry_run=not live)

        # ── Real P&L (only recorded for LIVE trades, not dry-runs) ───────────
        # API returns amounts in raw token units:
        #   OKB  → 18 decimals (wei)   e.g. 1e15 = 0.001 OKB
        #   USDT → 6  decimals (µUSDT) e.g. 83500 = 0.0835 USDT
        _TOKEN_DEC = {"OKB": 18, "USDT": 6, "USDC": 6}
        profit_okb = 0.0
        if live and result.success:
            try:
                raw_out = float(getattr(result, 'amount_out', 0) or 0)
                to_dec = _TOKEN_DEC.get(to_tok.upper(), 18)
                amount_out_human = raw_out / (10 ** to_dec)

                if to_tok.upper() == "OKB":
                    # Received OKB — direct gain
                    profit_okb = amount_out_human
                elif from_tok.upper() == "OKB":
                    # Sold OKB for USDT — convert back to OKB equiv
                    okb_price = float(obs_okb_price) if 'obs_okb_price' in dir() else 85.0
                    profit_okb = (amount_out_human / okb_price) - float(safe_amount)
            except Exception:
                profit_okb = 0.0
            _risk.record_trade(float(safe_amount), profit_okb)

        outcome_label = "executed_swap" if (live and result.success) else "simulated_swap"
        return {
            "outcome": outcome_label,
            "tx_hash": result.tx_hash,
            "amount": safe_amount,
            "amount_out": result.amount_out,
            "direction": f"{from_tok}→{to_tok}",
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
        # Record skill sync as collaboration event
        memory.record_observation(
            name, "skill", "sync_event",
            f"synced with swarm at {heartbeat_id}",
            confidence=0.9,
        )
        return {"outcome": "skill_synced", "heartbeat_id": heartbeat_id}

    else:
        return {"outcome": action, "reason": "no-op"}


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

    # REASON → ACT → LEARN for each agent (staggered to avoid NIM rate limits)
    for _agent_idx, agent_def in enumerate(AGENT_ROSTER):
        name = agent_def["name"]
        # Stagger agents 5+ by 3s to avoid NIM rate limit on late agents
        if _agent_idx >= 5:
            time.sleep(3)
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
            outcome = act(agent_def, decision, heartbeat_id)
            all_outcomes.append({"agent": name, **outcome})

            # Update decision outcome
            memory.update_decision_outcome(decision_id, outcome.get("outcome", "unknown"))

            # Learn
            learn(agent_def, decision, outcome)

            if outcome.get("outcome") not in ("wait", "blocked"):
                actions_taken += 1
            agents_run += 1

            logger.info("[%s] %s → %s", name, decision.get("action"), outcome.get("outcome"))

        except Exception as e:
            logger.error("[%s] cycle error: %s", name, e, exc_info=True)
            errors += 1

    # Log risk status after each cycle
    risk_status = _risk.status_dict()
    logger.info("[risk] Tier=%s | Balance=%.6f OKB | WinRate=%.1f%% | Profit=%.6f OKB",
                risk_status["tier"], risk_status["okb_balance"],
                risk_status["win_rate_pct"], risk_status["total_profit_okb"])

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
