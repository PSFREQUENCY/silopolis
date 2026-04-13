"""
SILOPOLIS — Trader Agent
Autonomous DEX trading agent using OnchainOS DEX API.
Detects arbitrage windows, executes swaps, enforces budget caps.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from core.agent import SiloAgent, BudgetExceeded
from onchainos.client import OnchainOSClient, OnchainOSError

logger = logging.getLogger(__name__)


class TraderAgent(SiloAgent):
    """
    Specialization: DEX trading & arbitrage on X Layer.
    Continuously scans for profitable swap opportunities and executes when
    spread exceeds min_profit_bps and budget allows.
    """

    AGENT_TYPE = "trader"

    # Token addresses on X Layer (OKB, USDT, USDC, WETH — populate after mainnet check)
    WATCHED_PAIRS: list[tuple[str, str]] = []

    def __init__(
        self,
        name: str,
        wallet_address: str,
        min_profit_bps: int = 20,  # Minimum 0.20% profit to execute
        max_trade_usd: float = 10.0,
        **kwargs: Any,
    ) -> None:
        super().__init__(name, wallet_address, **kwargs)
        self.min_profit_bps = min_profit_bps
        self.max_trade_usd = max_trade_usd
        self._onchainos = OnchainOSClient()
        self.trades_executed = 0
        self.total_pnl_usd = 0.0

    def scan_opportunities(self) -> list[dict]:
        """
        Use Claude to analyze market data and identify trade opportunities.
        Returns list of opportunities ranked by confidence.
        """
        try:
            # Get top token rankings on X Layer
            rankings = self._onchainos.get_token_ranking(limit=10)
            gas = self._onchainos.get_gas_price()

            analysis_prompt = f"""Analyze these X Layer token rankings and current gas price.
Identify up to 3 potential arbitrage or momentum opportunities.

Token Rankings:
{json.dumps(rankings, indent=2)}

Gas Price:
{json.dumps(gas, indent=2)}

Budget remaining today: ${self.budget.remaining_usd:.2f} USD
Max per trade: ${self.max_trade_usd:.2f} USD
Min profit threshold: {self.min_profit_bps} bps

Return JSON array of opportunities:
[{{"pair": "TOKEN_A/TOKEN_B", "direction": "buy|sell", "confidence": 0-100,
  "estimated_profit_bps": N, "reasoning": "...", "risk_level": "low|medium|high"}}]

Only include opportunities where confidence >= 60 and risk_level != "high" unless you have very strong signals."""

            analysis = self.think(analysis_prompt, max_tokens=512)
            # Extract JSON from response
            start = analysis.find("[")
            end = analysis.rfind("]") + 1
            if start != -1 and end > start:
                opportunities = json.loads(analysis[start:end])
            else:
                opportunities = []

            self.remember({"event": "scan", "opportunities_found": len(opportunities)})
            return opportunities

        except (OnchainOSError, BudgetExceeded) as e:
            logger.warning("scan_opportunities failed: %s", e)
            return []

    def evaluate_trade(self, opportunity: dict) -> dict | None:
        """
        Get a real swap quote for the opportunity and decide whether to execute.
        Returns the swap_tx dict if we should proceed, else None.
        """
        # Safety: never trade if budget would be exceeded
        try:
            self.budget.check_spend(self.max_trade_usd)
        except BudgetExceeded as e:
            logger.info("Skipping trade — budget cap: %s", e)
            return None

        confidence = opportunity.get("confidence", 0)
        risk = opportunity.get("risk_level", "high")
        est_profit = opportunity.get("estimated_profit_bps", 0)

        if confidence < 60 or risk == "high" or est_profit < self.min_profit_bps:
            return None

        return opportunity  # Caller executes if not None

    def run_cycle(self) -> dict:
        """
        One trader cycle:
        1. Scan for opportunities
        2. Evaluate top opportunity
        3. Execute if criteria met (in live mode)
        4. Update reputation & memory
        """
        cycle_start = time.time()
        result = {
            "agent": self.name,
            "type": "trade_cycle",
            "opportunities": [],
            "executed": False,
            "reason": "",
        }

        opportunities = self.scan_opportunities()
        result["opportunities"] = opportunities

        if not opportunities:
            result["reason"] = "no_opportunities"
            self.update_reputation("accuracy", -1)
            return result

        # Take the highest-confidence opportunity
        best = max(opportunities, key=lambda o: o.get("confidence", 0))
        trade_decision = self.evaluate_trade(best)

        if trade_decision is None:
            result["reason"] = "evaluation_failed_criteria"
            return result

        # In simulation mode (no private key set), log the intent but don't broadcast
        result["trade_intent"] = trade_decision
        result["executed"] = False  # Switch to True only when wallet is wired
        result["reason"] = "simulation_mode"

        # Reputation boost for good analysis
        self.update_reputation("cognition", 2)
        self.update_reputation("accuracy", 1)

        self.remember({"event": "trade_cycle", "best_opportunity": best})
        result["cycle_ms"] = int((time.time() - cycle_start) * 1000)
        return result
