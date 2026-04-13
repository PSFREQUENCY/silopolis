"""
SILOPOLIS — Base Agent
Every agent in the swarm inherits from this class.
Provides: identity, reputation tracking, skill management, budget enforcement,
          OnchainOS integration hooks, and Claude cognition layer.
"""
from __future__ import annotations

import os
import json
import time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from pathlib import Path

import anthropic

logger = logging.getLogger(__name__)


# ─── Budget Governor ──────────────────────────────────────────────────────────

@dataclass
class BudgetGovernor:
    """Enforces hard spend caps. Raises BudgetExceeded if limits are hit."""

    max_spend_usd_per_day: float = 50.0
    max_gas_gwei: float = 50.0
    max_llm_tokens_per_day: int = 500_000

    _spent_usd_today: float = field(default=0.0, init=False, repr=False)
    _tokens_today: int = field(default=0, init=False, repr=False)
    _day_start: float = field(default_factory=time.time, init=False, repr=False)

    def _reset_if_new_day(self) -> None:
        if time.time() - self._day_start >= 86400:
            self._spent_usd_today = 0.0
            self._tokens_today = 0
            self._day_start = time.time()

    def check_spend(self, usd_amount: float) -> None:
        self._reset_if_new_day()
        projected = self._spent_usd_today + usd_amount
        if projected > self.max_spend_usd_per_day:
            raise BudgetExceeded(
                f"Daily spend cap ${self.max_spend_usd_per_day:.2f} would be exceeded "
                f"(current ${self._spent_usd_today:.2f} + proposed ${usd_amount:.2f})"
            )

    def record_spend(self, usd_amount: float) -> None:
        self._reset_if_new_day()
        self._spent_usd_today += usd_amount

    def check_gas(self, gwei: float) -> None:
        if gwei > self.max_gas_gwei:
            raise BudgetExceeded(f"Gas {gwei} gwei exceeds max {self.max_gas_gwei} gwei")

    def check_tokens(self, count: int) -> None:
        self._reset_if_new_day()
        if self._tokens_today + count > self.max_llm_tokens_per_day:
            raise BudgetExceeded(f"Daily LLM token budget ({self.max_llm_tokens_per_day}) exceeded")

    def record_tokens(self, count: int) -> None:
        self._reset_if_new_day()
        self._tokens_today += count

    @property
    def remaining_usd(self) -> float:
        self._reset_if_new_day()
        return max(0.0, self.max_spend_usd_per_day - self._spent_usd_today)


class BudgetExceeded(Exception):
    pass


# ─── Skill System ─────────────────────────────────────────────────────────────

@dataclass
class Skill:
    skill_id: str
    name: str
    category: str
    schema: dict          # JSON schema defining what this skill can do
    proficiency: int = 0  # 0–100
    learned_from: str = ""
    acquired_at: float = field(default_factory=time.time)

    def to_prompt_fragment(self) -> str:
        """Render skill as a context fragment injected into agent prompts."""
        return (
            f"[Skill: {self.name} | Category: {self.category} | "
            f"Proficiency: {self.proficiency}/100]\n"
            f"{self.schema.get('description', '')}"
        )


@dataclass
class ReputationSnapshot:
    accuracy: float = 500.0
    quality: float = 500.0
    execution: float = 500.0
    structure: float = 500.0
    safety: float = 500.0
    security: float = 500.0
    cognition: float = 500.0
    collaboration: float = 500.0

    @property
    def composite(self) -> float:
        dims = [
            self.accuracy, self.quality, self.execution, self.structure,
            self.safety, self.security, self.cognition, self.collaboration,
        ]
        return sum(dims) / len(dims)

    def to_dict(self) -> dict:
        return {
            "accuracy": self.accuracy,
            "quality": self.quality,
            "execution": self.execution,
            "structure": self.structure,
            "safety": self.safety,
            "security": self.security,
            "cognition": self.cognition,
            "collaboration": self.collaboration,
            "composite": self.composite,
        }


# ─── Base Agent ───────────────────────────────────────────────────────────────

class SiloAgent(ABC):
    """
    Base class for all SILOPOLIS agents.
    Subclass and implement `think()` and `act()`.
    """

    AGENT_TYPE: str = "base"

    def __init__(
        self,
        name: str,
        wallet_address: str,
        budget: BudgetGovernor | None = None,
    ) -> None:
        self.name = name
        self.wallet_address = wallet_address
        self.budget = budget or BudgetGovernor(
            max_spend_usd_per_day=float(os.environ.get("SILOPOLIS_MAX_SPEND_PER_DAY_USD", "10")),
            max_gas_gwei=float(os.environ.get("SILOPOLIS_MAX_GAS_GWEI", "50")),
        )
        self.reputation = ReputationSnapshot()
        self.skills: dict[str, Skill] = {}
        self.memory: list[dict] = []   # Rolling conversation / event log
        self.tx_count: int = 0
        self._claude = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        self._log = logging.getLogger(f"silopolis.{name}")

    # ─── Cognition (Claude) ───────────────────────────────────────────────────

    def think(self, context: str, max_tokens: int = 1024) -> str:
        """
        Ask Claude to reason about `context`.
        Enforces token budget and injects agent skills as context.
        """
        self.budget.check_tokens(max_tokens)

        skill_context = "\n".join(s.to_prompt_fragment() for s in self.skills.values())
        system_prompt = f"""You are {self.name}, an autonomous AI agent in the SILOPOLIS swarm on X Layer.

Agent type: {self.AGENT_TYPE}
Wallet: {self.wallet_address}
Reputation (composite): {self.reputation.composite:.1f}/1000

Your active skills:
{skill_context or "(none yet — you can acquire skills from the SkillMarket)"}

Your constraints:
- Daily spend cap: ${self.budget.max_spend_usd_per_day:.2f} USD (remaining: ${self.budget.remaining_usd:.2f})
- Max gas: {self.budget.max_gas_gwei} gwei
- Safety first: never execute trades above your spend cap. Never share private keys.
- Accuracy matters: if uncertain, report low confidence rather than guessing.

Reason carefully, be concise, and output structured JSON when taking action."""

        resp = self._claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": context}],
        )
        text = resp.content[0].text
        tokens_used = resp.usage.input_tokens + resp.usage.output_tokens
        self.budget.record_tokens(tokens_used)
        self._log.debug("think() used %d tokens", tokens_used)
        return text

    # ─── Skills ───────────────────────────────────────────────────────────────

    def acquire_skill(self, skill: Skill) -> None:
        """Add a skill to this agent's repertoire."""
        self.skills[skill.skill_id] = skill
        self._log.info("Acquired skill: %s (proficiency %d)", skill.name, skill.proficiency)

    def teach_skill(self, skill_id: str, learner: "SiloAgent") -> bool:
        """Transfer a skill to another agent (collaboration)."""
        if skill_id not in self.skills:
            return False
        original = self.skills[skill_id]
        transferred = Skill(
            skill_id=original.skill_id,
            name=original.name,
            category=original.category,
            schema=original.schema,
            proficiency=max(1, original.proficiency - 10),  # slight decay on transfer
            learned_from=self.name,
        )
        learner.acquire_skill(transferred)
        # Boost collaboration score
        self.reputation.collaboration = min(1000, self.reputation.collaboration + 5)
        return True

    # ─── Memory ───────────────────────────────────────────────────────────────

    def remember(self, event: dict) -> None:
        """Append an event to rolling memory (capped at 200 entries)."""
        event["ts"] = datetime.now(timezone.utc).isoformat()
        self.memory.append(event)
        if len(self.memory) > 200:
            self.memory = self.memory[-200:]

    # ─── Reputation Reporting ─────────────────────────────────────────────────

    def update_reputation(self, dimension: str, delta: float) -> None:
        """
        Locally update reputation before syncing to on-chain.
        delta can be positive or negative.
        """
        current = getattr(self.reputation, dimension, None)
        if current is None:
            raise ValueError(f"Unknown reputation dimension: {dimension}")
        updated = max(0.0, min(1000.0, current + delta))
        setattr(self.reputation, dimension, updated)

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    @abstractmethod
    def run_cycle(self) -> dict:
        """Execute one agent work cycle. Returns a result dict."""
        ...

    def status(self) -> dict:
        return {
            "name": self.name,
            "type": self.AGENT_TYPE,
            "wallet": self.wallet_address,
            "tx_count": self.tx_count,
            "skills": list(self.skills.keys()),
            "reputation": self.reputation.to_dict(),
            "budget_remaining_usd": self.budget.remaining_usd,
        }
