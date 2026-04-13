"""
SILOPOLIS — Swarm Orchestrator
Manages a fleet of heterogeneous agents running in parallel.
Enforces global resource limits across the entire swarm.
Facilitates skill sharing between agents.
"""
from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from core.agent import SiloAgent, BudgetGovernor, ReputationSnapshot

logger = logging.getLogger(__name__)


class Swarm:
    """
    Orchestrates multiple SiloAgents, runs them in parallel worker threads,
    collects results, routes skill sharing, and exposes a live status feed.
    """

    def __init__(
        self,
        max_workers: int = 5,
        global_spend_cap_usd: float = 50.0,
        cycle_interval_sec: float = 60.0,
    ) -> None:
        self.agents: dict[str, SiloAgent] = {}
        self.max_workers = max_workers
        self.cycle_interval = cycle_interval_sec
        self._global_budget = BudgetGovernor(max_spend_usd_per_day=global_spend_cap_usd)
        self._running = False
        self._results: list[dict] = []
        self._cycle_count = 0

    # ─── Agent Management ─────────────────────────────────────────────────────

    def add_agent(self, agent: SiloAgent) -> None:
        if agent.name in self.agents:
            raise ValueError(f"Agent {agent.name!r} already in swarm")
        self.agents[agent.name] = agent
        logger.info("Added agent %r (%s) to swarm", agent.name, agent.AGENT_TYPE)

    def remove_agent(self, name: str) -> None:
        self.agents.pop(name, None)

    # ─── Skill Routing ────────────────────────────────────────────────────────

    def broadcast_skill(self, from_agent: str, skill_id: str) -> int:
        """
        Have one agent teach a skill to all other active agents.
        Returns count of successful transfers.
        """
        teacher = self.agents.get(from_agent)
        if not teacher:
            return 0
        count = 0
        for name, agent in self.agents.items():
            if name != from_agent:
                if teacher.teach_skill(skill_id, agent):
                    count += 1
                    logger.info("Skill %r transferred: %s → %s", skill_id, from_agent, name)
        return count

    def sync_knowledge(self) -> dict[str, list[str]]:
        """
        Peer-to-peer knowledge sync: each agent shares its highest-proficiency
        skill with any agent that doesn't have it.
        Returns a map of {agent_name: [skills_received]}.
        """
        received: dict[str, list[str]] = {name: [] for name in self.agents}

        for teacher_name, teacher in self.agents.items():
            if not teacher.skills:
                continue
            best_skill = max(teacher.skills.values(), key=lambda s: s.proficiency)
            for learner_name, learner in self.agents.items():
                if learner_name == teacher_name:
                    continue
                if best_skill.skill_id not in learner.skills:
                    teacher.teach_skill(best_skill.skill_id, learner)
                    received[learner_name].append(best_skill.skill_id)

        return received

    # ─── Execution ────────────────────────────────────────────────────────────

    def _run_agent_cycle(self, agent: SiloAgent) -> dict:
        """Run a single agent cycle with error isolation."""
        try:
            result = agent.run_cycle()
            result["agent"] = agent.name
            result["status"] = "ok"
            return result
        except Exception as e:
            logger.error("Agent %r cycle error: %s", agent.name, e, exc_info=True)
            agent.update_reputation("execution", -20)
            return {"agent": agent.name, "status": "error", "error": str(e)}

    def run_once(self) -> list[dict]:
        """Run one cycle for all agents in parallel. Returns cycle results."""
        self._cycle_count += 1
        results = []

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._run_agent_cycle, agent): name
                for name, agent in self.agents.items()
            }
            for future in as_completed(futures):
                result = future.result()
                results.append(result)

        self._results.extend(results)
        if len(self._results) > 1000:
            self._results = self._results[-1000:]

        # After each cycle, sync knowledge between agents
        transfers = self.sync_knowledge()
        logger.info(
            "Cycle %d complete — %d agents, %d skill transfers",
            self._cycle_count, len(self.agents),
            sum(len(v) for v in transfers.values()),
        )
        return results

    def run_forever(self) -> None:
        """
        Run the swarm in an infinite loop with cycle_interval between rounds.
        Blocks until stopped via stop().
        """
        self._running = True
        logger.info("Swarm started — %d agents, interval=%.1fs", len(self.agents), self.cycle_interval)
        while self._running:
            cycle_start = time.time()
            self.run_once()
            elapsed = time.time() - cycle_start
            sleep_for = max(0.0, self.cycle_interval - elapsed)
            if sleep_for > 0:
                time.sleep(sleep_for)

    def stop(self) -> None:
        self._running = False

    # ─── Status ───────────────────────────────────────────────────────────────

    def status(self) -> dict:
        return {
            "running": self._running,
            "cycle_count": self._cycle_count,
            "agent_count": len(self.agents),
            "agents": {name: agent.status() for name, agent in self.agents.items()},
            "global_budget_remaining_usd": self._global_budget.remaining_usd,
        }

    def leaderboard(self) -> list[dict]:
        """Return agents ranked by composite reputation."""
        ranked = sorted(
            self.agents.values(),
            key=lambda a: a.reputation.composite,
            reverse=True,
        )
        return [
            {
                "rank": i + 1,
                "name": a.name,
                "type": a.AGENT_TYPE,
                "composite": round(a.reputation.composite, 1),
                "dimensions": a.reputation.to_dict(),
                "skills": len(a.skills),
                "tx_count": a.tx_count,
            }
            for i, a in enumerate(ranked)
        ]
