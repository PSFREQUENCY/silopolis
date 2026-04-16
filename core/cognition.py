"""
SILOPOLIS — SwarmFi Cognition Engine
Multi-model reasoning layer inspired by Living Swarm architecture.

Routing logic (from Living Swarm herald-01):
  Simple/fast queries → Gemini 2.5 Flash (low latency, low cost)
  Complex/multi-step → Gemini 2.5 Pro (deep reasoning)
  Threat/safety gate → runs before any on-chain action

Shows real-time agentic reasoning via streaming status events.
"""
from __future__ import annotations

import os
import json
import time
import logging
import hmac
import hashlib
from dataclasses import dataclass, field
from typing import Generator, Any

import httpx

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_KEY  = os.environ.get("GEMINI_API_KEY", "")
FLASH_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
PRO_MODEL   = "gemini-2.5-pro"

# NVIDIA NIM / MiniMax M2.7 (cloud inference — 6-month free tier)
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
NIM_BASE       = "https://integrate.api.nvidia.com/v1"
NIM_MODEL      = os.environ.get("NIM_MODEL", "minimaxai/minimax-m2.7")


# ─── Threat Gate (ported from Living Swarm arbiter-05) ────────────────────────

THREAT_SIGNALS = {
    "high": [
        "drain", "rug", "infinite approve", "unlimited allowance",
        "transfer all", "send all", "empty wallet", "approve max",
        "0xffffffff", "selfdestruct", "delegatecall unknown",
    ],
    "medium": [
        "unverified contract", "new token", "low liquidity", "no audit",
        "unknown protocol", "honeypot", "blacklisted",
    ],
    "low": [
        "slippage > 5%", "large trade", "high gas",
    ],
}


@dataclass
class ThreatAssessment:
    score: int           # 0–100
    level: str           # "safe" | "caution" | "danger" | "block"
    signals: list[str]
    reasoning: str
    approved: bool

    @property
    def blocked(self) -> bool:
        return self.score >= 76


def assess_threat(action: dict) -> ThreatAssessment:
    """
    Fast, local threat scoring before any on-chain action.
    Score 0–75: allow. 76–100: block.
    Mirrors living-swarm arbiter-05 logic.
    """
    action_str = json.dumps(action).lower()
    signals = []
    score = 0

    for sig in THREAT_SIGNALS["high"]:
        if sig in action_str:
            signals.append(f"HIGH: {sig}")
            score += 40  # 2 high signals = instant block

    for sig in THREAT_SIGNALS["medium"]:
        if sig in action_str:
            signals.append(f"MED: {sig}")
            score += 20

    for sig in THREAT_SIGNALS["low"]:
        if sig in action_str:
            signals.append(f"LOW: {sig}")
            score += 5

    score = min(100, score)

    if score == 0:
        level = "safe"
    elif score < 30:
        level = "caution"
    elif score < 76:
        level = "danger"
    else:
        level = "block"

    reasoning = (
        f"Score {score}/100. Signals: {signals}" if signals
        else "No threat signals detected."
    )

    return ThreatAssessment(
        score=score,
        level=level,
        signals=signals,
        reasoning=reasoning,
        approved=score < 76,
    )


# ─── Simple vs Complex routing (from Living Swarm herald logic) ───────────────

REALTIME_SIGNALS = [
    "price", "today", "current", "right now", "latest", "live",
    "news", "market", "trending", "now", "recently", "just",
    "score", "result", "winner", "swap", "trade", "arbitrage",
    "gas", "liquidity", "volume",
]

COMPLEX_SIGNALS = [
    "analyze", "compare", "strategy", "optimize", "explain how",
    "step by step", "architecture", "design", "reason", "evaluate",
    "best approach", "should i", "what if", "simulate",
]


def _should_use_pro(prompt: str) -> bool:
    """Route to Pro model for complex multi-step reasoning."""
    p = prompt.lower()
    word_count = len(p.split())
    if word_count > 60:
        return True
    return any(s in p for s in COMPLEX_SIGNALS)


# ─── Gemini Client ────────────────────────────────────────────────────────────

def _gemini_generate(
    model: str,
    prompt: str,
    system: str = "",
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    if not GEMINI_KEY:
        raise EnvironmentError("GEMINI_API_KEY not set")

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}

    url = f"{GEMINI_BASE}/{model}:generateContent?key={GEMINI_KEY}"

    # Retry up to 2x on 429/timeout — fast fallback to NIM after 2 tries
    for attempt in range(2):
        try:
            resp = httpx.post(url, json=payload, timeout=25.0)
            if resp.status_code == 429:
                wait = 15 + attempt * 10  # 15s, 25s
                logger.info("[Gemini] 429 rate limit on %s — waiting %ds (attempt %d/2)", model, wait, attempt + 1)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except httpx.ReadTimeout:
            if attempt < 1:
                logger.warning("[Gemini] Read timeout on %s (attempt %d/2) — retrying in 3s", model, attempt + 1)
                time.sleep(3)
                continue
            raise
    raise RuntimeError(f"Gemini {model} unavailable after 2 attempts")


# ─── NVIDIA NIM Client (MiniMax M2.7) ─────────────────────────────────────────

def _nim_generate(
    prompt: str,
    system: str = "",
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """Call MiniMax M2.7 via NVIDIA cloud inference API (OpenAI-compatible)."""
    if not NVIDIA_API_KEY:
        raise EnvironmentError("NVIDIA_API_KEY not set")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": NIM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
    }
    # Retry up to 3 times on 429 with backoff
    for attempt in range(3):
        resp = httpx.post(f"{NIM_BASE}/chat/completions", json=payload, headers=headers, timeout=90.0)
        if resp.status_code == 404:
            raise EnvironmentError(f"NIM model {NIM_MODEL!r} not found on cloud API (404).")
        if resp.status_code == 429:
            wait = (attempt + 1) * 12  # 12s, 24s, 36s
            logger.info("[NIM] Rate limited (429) — waiting %ds before retry %d/3", wait, attempt + 1)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    raise RuntimeError("NIM API rate limit exceeded after 3 retries")


# ─── SwarmFi Cognition ────────────────────────────────────────────────────────

@dataclass
class ThinkResult:
    model: str
    prompt_summary: str
    response: str
    latency_ms: int
    tokens_estimated: int
    threat: ThreatAssessment | None = None


class SwarmFiCognition:
    """
    Drop-in cognition engine for SILOPOLIS agents.
    Replaces direct Claude/Gemini calls with routed, threat-gated reasoning.

    Usage:
        cog = SwarmFiCognition(agent_name="SILO-TRADER-1")
        result = cog.think("Should I swap OKB → USDT now given current spread?")
    """

    def __init__(
        self,
        agent_name: str,
        system_context: str = "",
        max_tokens: int = 1024,
    ) -> None:
        self.agent_name = agent_name
        self.system_context = system_context
        self.max_tokens = max_tokens
        self._history: list[dict] = []

    def think(
        self,
        prompt: str,
        action_to_gate: dict | None = None,
        stream_callback: Any = None,
    ) -> ThinkResult:
        """
        Reason about a prompt, optionally threat-gating an action first.

        Args:
            prompt: The reasoning prompt
            action_to_gate: If provided, run threat assessment before reasoning
            stream_callback: Optional callable(event_str) for real-time status
        """
        def emit(msg: str) -> None:
            if stream_callback:
                stream_callback(msg)
            logger.debug("[%s] %s", self.agent_name, msg)

        # Step 1: Threat gate
        threat = None
        if action_to_gate:
            emit(f"🛡 Running threat assessment for action: {action_to_gate.get('type', '?')}...")
            threat = assess_threat(action_to_gate)
            emit(f"🛡 Threat score: {threat.score}/100 — {threat.level.upper()}")
            if threat.blocked:
                return ThinkResult(
                    model="threat-gate",
                    prompt_summary=prompt[:80],
                    response=f"BLOCKED: {threat.reasoning}",
                    latency_ms=0,
                    tokens_estimated=0,
                    threat=threat,
                )

        # Step 2: Route to model
        # NIM (MiniMax M2.7) is primary when available — no rate limit issues.
        # Gemini is secondary fallback for when NIM is unavailable.
        use_pro = _should_use_pro(prompt)

        system = self.system_context or (
            f"You are {self.agent_name}, an autonomous AI agent in the SILOPOLIS swarm on X Layer. "
            "You reason about DeFi actions, market data, and on-chain strategy. "
            "Be precise and output structured JSON for any actionable decisions."
        )

        t0 = time.time()

        if NVIDIA_API_KEY:
            # Primary: NIM — fast, no quota limits
            model = NIM_MODEL
            emit(f"🧠 Routing to MiniMax M2.7 via NIM (primary)...")
            try:
                response = _nim_generate(prompt=prompt, system=system, temperature=0.7, max_tokens=self.max_tokens)
            except Exception as e:
                # NIM failed — fall back to Gemini
                emit(f"⚠ NIM unavailable ({e}), falling back to Gemini...")
                gemini_model = PRO_MODEL if use_pro else FLASH_MODEL
                model = gemini_model
                try:
                    response = _gemini_generate(
                        model=gemini_model, prompt=prompt, system=system,
                        temperature=0.7, max_tokens=self.max_tokens,
                    )
                except Exception as e2:
                    emit(f"🔀 Rerouting — all channels busy, standing by: {e2}")
                    raise
        else:
            # No NIM key — use Gemini directly
            model = PRO_MODEL if use_pro else FLASH_MODEL
            emit(f"🧠 Routing to {model}{'(complex)' if use_pro else '(fast)'}...")
            try:
                response = _gemini_generate(
                    model=model, prompt=prompt, system=system,
                    temperature=0.7, max_tokens=self.max_tokens,
                )
            except Exception as e:
                emit(f"🔀 Rerouting — all channels busy, standing by: {e}")
                raise
        latency_ms = int((time.time() - t0) * 1000)
        tokens_est = len(response.split()) * 2
        emit(f"✅ Response ready ({latency_ms}ms, ~{tokens_est} tokens, model={model})")

        result = ThinkResult(
            model=model,
            prompt_summary=prompt[:80],
            response=response,
            latency_ms=latency_ms,
            tokens_estimated=tokens_est,
            threat=threat,
        )

        # Append to history
        self._history.append({
            "ts": time.time(),
            "prompt": prompt[:200],
            "model": model,
            "latency_ms": latency_ms,
            "threat_score": threat.score if threat else None,
        })
        if len(self._history) > 100:
            self._history = self._history[-100:]

        return result

    def analyze_market(
        self,
        market_data: dict,
        wallet_balance: dict | None = None,
        budget_remaining: float = 10.0,
    ) -> ThinkResult:
        """
        Full SwarmFi market analysis cycle.
        Detects opportunities, ranks by confidence, considers budget.
        """
        prompt = f"""You are analyzing X Layer DeFi market data for a SILOPOLIS trading agent.

Market Data:
{json.dumps(market_data, indent=2)}

{"Wallet Balance: " + json.dumps(wallet_balance, indent=2) if wallet_balance else ""}

Budget remaining today: ${budget_remaining:.2f} USD

Perform a full SwarmFi analysis:
1. Identify the top 3 opportunities (arbitrage, momentum, liquidity)
2. For each: confidence (0-100), estimated profit bps, risk level, required action
3. Check for any threat signals before recommending

Output JSON:
{{
  "opportunities": [
    {{"rank": 1, "type": "arb|momentum|liquidity", "pair": "...", "confidence": N,
      "profit_bps": N, "risk": "low|medium|high", "action": {{...}}, "reasoning": "..."}}
  ],
  "market_sentiment": "bullish|neutral|bearish",
  "recommended_action": "wait|trade|rebalance",
  "reasoning": "..."
}}"""

        return self.think(
            prompt=prompt,
            stream_callback=lambda m: logger.info("[SwarmFi] %s", m),
        )

    @property
    def reasoning_history(self) -> list[dict]:
        return self._history[-20:]
