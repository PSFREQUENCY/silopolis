"""
SILOPOLIS — Persistent Knowledge Memory
SQLite-backed store that survives process restarts.

Tables:
  agent_states     — agent reputation, skills, budgets (load/save across restarts)
  knowledge_graph  — learned market patterns, observations, facts
  decision_log     — every decision with outcome (basis for self-improvement)
  market_snapshots — price/trend history for pattern analysis
  heartbeat_log    — when heartbeats ran and what happened
  skill_graph      — per-agent skill performance metrics

This is the "long-term memory" layer. The in-process SiloAgent.memory list
is short-term / ephemeral. This persists across restarts and heartbeat gaps.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "silopolis.db"


# ─── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_states (
    agent_name          TEXT PRIMARY KEY,
    agent_type          TEXT NOT NULL DEFAULT 'base',
    wallet_address      TEXT NOT NULL DEFAULT '',
    reputation_json     TEXT NOT NULL DEFAULT '{}',
    skills_json         TEXT NOT NULL DEFAULT '{}',
    tx_count            INTEGER NOT NULL DEFAULT 0,
    budget_spent_today  REAL NOT NULL DEFAULT 0.0,
    cycle_count         INTEGER NOT NULL DEFAULT 0,
    last_action         TEXT,
    updated_at          REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_graph (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name      TEXT NOT NULL,
    observation_type TEXT NOT NULL,   -- 'market', 'skill', 'pattern', 'risk', 'opportunity'
    key             TEXT NOT NULL,
    value           TEXT NOT NULL,
    confidence      REAL NOT NULL DEFAULT 0.5,
    reinforcement   INTEGER NOT NULL DEFAULT 1,
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_unique
    ON knowledge_graph(agent_name, observation_type, key);

CREATE TABLE IF NOT EXISTS decision_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name  TEXT NOT NULL,
    cycle_id    TEXT NOT NULL,
    context     TEXT NOT NULL,
    decision    TEXT NOT NULL,
    outcome     TEXT,              -- filled in after act()
    profit_usd  REAL,
    tx_hash     TEXT,              -- on-chain tx hash if swap executed
    threat_score INTEGER,
    model_used  TEXT,
    latency_ms  INTEGER,
    timestamp   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token_pair  TEXT NOT NULL,
    price_usd   REAL,
    volume_24h  REAL,
    trend       TEXT,
    data_json   TEXT NOT NULL DEFAULT '{}',
    source      TEXT NOT NULL DEFAULT 'onchainos',
    timestamp   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    heartbeat_id    TEXT UNIQUE NOT NULL,
    started_at      REAL NOT NULL,
    completed_at    REAL,
    agents_run      INTEGER NOT NULL DEFAULT 0,
    actions_taken   INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    summary         TEXT,
    market_sentiment TEXT
);

CREATE TABLE IF NOT EXISTS skill_graph (
    skill_id        TEXT NOT NULL,
    agent_name      TEXT NOT NULL,
    proficiency     INTEGER NOT NULL DEFAULT 0,
    use_count       INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    last_used       REAL,
    PRIMARY KEY (skill_id, agent_name)
);
"""


# ─── Connection Manager ───────────────────────────────────────────────────────

@contextmanager
def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    with _conn() as con:
        con.executescript(_SCHEMA)
        # Migration: add tx_hash column if it doesn't exist yet
        try:
            con.execute("ALTER TABLE decision_log ADD COLUMN tx_hash TEXT")
            logger.info("Migrated decision_log: added tx_hash column")
        except Exception:
            pass  # already exists
    logger.info("Memory DB ready: %s", DB_PATH)


# ─── Agent State ──────────────────────────────────────────────────────────────

def save_agent_state(agent: Any) -> None:
    """
    Persist a SiloAgent's mutable state to DB.
    Call after each heartbeat cycle.
    """
    from core.agent import SiloAgent  # avoid circular at module level
    rep = agent.reputation.to_dict() if hasattr(agent.reputation, "to_dict") else {}
    skills = {
        sid: {
            "skill_id": s.skill_id,
            "name": s.name,
            "category": s.category,
            "proficiency": s.proficiency,
            "learned_from": s.learned_from,
        }
        for sid, s in agent.skills.items()
    }
    with _conn() as con:
        con.execute("""
            INSERT INTO agent_states
                (agent_name, agent_type, wallet_address, reputation_json,
                 skills_json, tx_count, cycle_count, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(agent_name) DO UPDATE SET
                reputation_json     = excluded.reputation_json,
                skills_json         = excluded.skills_json,
                tx_count            = excluded.tx_count,
                updated_at          = excluded.updated_at
        """, (
            agent.name,
            getattr(agent, "AGENT_TYPE", "base"),
            agent.wallet_address,
            json.dumps(rep),
            json.dumps(skills),
            agent.tx_count,
            time.time(),
        ))
    logger.debug("Saved state for agent %s", agent.name)


def load_agent_state(agent_name: str) -> dict | None:
    """Load persisted state for an agent. Returns None if never saved."""
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM agent_states WHERE agent_name = ?", (agent_name,)
        ).fetchone()
    if not row:
        return None
    return {
        "agent_name": row["agent_name"],
        "agent_type": row["agent_type"],
        "wallet_address": row["wallet_address"],
        "reputation": json.loads(row["reputation_json"]),
        "skills": json.loads(row["skills_json"]),
        "tx_count": row["tx_count"],
        "cycle_count": row["cycle_count"],
        "updated_at": row["updated_at"],
    }


def restore_agent_reputation(agent: Any) -> bool:
    """
    Restore a live agent's reputation from DB.
    Returns True if state was found and applied.
    """
    state = load_agent_state(agent.name)
    if not state:
        return False
    rep = state["reputation"]
    for dim in ("accuracy", "quality", "execution", "structure",
                "safety", "security", "cognition", "collaboration"):
        if dim in rep:
            setattr(agent.reputation, dim, float(rep[dim]))
    agent.tx_count = state["tx_count"]
    logger.info("Restored %s: composite=%.1f, tx=%d",
                agent.name, agent.reputation.composite, agent.tx_count)
    return True


# ─── Knowledge Graph ──────────────────────────────────────────────────────────

def record_observation(
    agent_name: str,
    observation_type: str,
    key: str,
    value: str | dict,
    confidence: float = 0.5,
) -> None:
    """
    Store or reinforce a learned observation.
    Duplicate key+type → updates value and boosts reinforcement.
    """
    val_str = json.dumps(value) if isinstance(value, dict) else str(value)
    now = time.time()
    with _conn() as con:
        con.execute("""
            INSERT INTO knowledge_graph
                (agent_name, observation_type, key, value, confidence, reinforcement, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(agent_name, observation_type, key) DO UPDATE SET
                value         = excluded.value,
                confidence    = min(0.99, knowledge_graph.confidence * 0.7 + excluded.confidence * 0.3),
                reinforcement = knowledge_graph.reinforcement + 1,
                updated_at    = excluded.updated_at
        """, (agent_name, observation_type, key, val_str, confidence, now, now))


def get_knowledge(
    agent_name: str,
    observation_type: str | None = None,
    min_confidence: float = 0.3,
    limit: int = 50,
) -> list[dict]:
    """Retrieve knowledge entries, highest confidence first."""
    with _conn() as con:
        if observation_type:
            rows = con.execute("""
                SELECT * FROM knowledge_graph
                WHERE agent_name = ? AND observation_type = ? AND confidence >= ?
                ORDER BY confidence DESC, reinforcement DESC
                LIMIT ?
            """, (agent_name, observation_type, min_confidence, limit)).fetchall()
        else:
            rows = con.execute("""
                SELECT * FROM knowledge_graph
                WHERE agent_name = ? AND confidence >= ?
                ORDER BY confidence DESC, reinforcement DESC
                LIMIT ?
            """, (agent_name, min_confidence, limit)).fetchall()
    return [dict(r) for r in rows]


def get_swarm_knowledge(min_confidence: float = 0.4, limit: int = 100) -> list[dict]:
    """Aggregate knowledge across all agents — the swarm's collective intelligence."""
    with _conn() as con:
        rows = con.execute("""
            SELECT observation_type, key, value,
                   AVG(confidence) as avg_confidence,
                   SUM(reinforcement) as total_reinforcement,
                   COUNT(DISTINCT agent_name) as agent_count
            FROM knowledge_graph
            WHERE confidence >= ?
            GROUP BY observation_type, key
            ORDER BY total_reinforcement DESC, avg_confidence DESC
            LIMIT ?
        """, (min_confidence, limit)).fetchall()
    return [dict(r) for r in rows]


# ─── Decision Log ─────────────────────────────────────────────────────────────

def log_decision(
    agent_name: str,
    cycle_id: str,
    context: str,
    decision: str,
    threat_score: int | None = None,
    model_used: str | None = None,
    latency_ms: int | None = None,
) -> int:
    """Record a decision. Returns the row id for later outcome updating."""
    with _conn() as con:
        cur = con.execute("""
            INSERT INTO decision_log
                (agent_name, cycle_id, context, decision, threat_score,
                 model_used, latency_ms, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (agent_name, cycle_id, context[:1000], decision[:2000],
              threat_score, model_used, latency_ms, time.time()))
        return cur.lastrowid


def update_decision_outcome(
    decision_id: int,
    outcome: str,
    profit_usd: float | None = None,
    tx_hash: str | None = None,
) -> None:
    """Fill in outcome after observing what happened."""
    with _conn() as con:
        con.execute("""
            UPDATE decision_log
            SET outcome = ?, profit_usd = ?, tx_hash = ?
            WHERE id = ?
        """, (outcome, profit_usd, tx_hash, decision_id))


def get_decision_history(
    agent_name: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Pull recent decisions for self-improvement analysis."""
    with _conn() as con:
        if agent_name:
            rows = con.execute("""
                SELECT * FROM decision_log
                WHERE agent_name = ?
                ORDER BY timestamp DESC LIMIT ?
            """, (agent_name, limit)).fetchall()
        else:
            rows = con.execute("""
                SELECT * FROM decision_log
                ORDER BY timestamp DESC LIMIT ?
            """, (limit,)).fetchall()
    return [dict(r) for r in rows]


# ─── Market Snapshots ─────────────────────────────────────────────────────────

def save_market_snapshot(
    token_pair: str,
    price_usd: float | None,
    volume_24h: float | None,
    trend: str | None,
    data: dict,
    source: str = "onchainos",
) -> None:
    with _conn() as con:
        con.execute("""
            INSERT INTO market_snapshots
                (token_pair, price_usd, volume_24h, trend, data_json, source, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (token_pair, price_usd, volume_24h, trend,
              json.dumps(data), source, time.time()))


def get_market_history(
    token_pair: str,
    lookback_hours: float = 24.0,
) -> list[dict]:
    """Get price history for pattern analysis."""
    since = time.time() - lookback_hours * 3600
    with _conn() as con:
        rows = con.execute("""
            SELECT * FROM market_snapshots
            WHERE token_pair = ? AND timestamp >= ?
            ORDER BY timestamp ASC
        """, (token_pair, since)).fetchall()
    return [dict(r) for r in rows]


# ─── Heartbeat Log ────────────────────────────────────────────────────────────

def start_heartbeat(heartbeat_id: str) -> None:
    with _conn() as con:
        con.execute("""
            INSERT OR IGNORE INTO heartbeat_log (heartbeat_id, started_at)
            VALUES (?, ?)
        """, (heartbeat_id, time.time()))


def finish_heartbeat(
    heartbeat_id: str,
    agents_run: int,
    actions_taken: int,
    errors: int,
    summary: str,
    market_sentiment: str = "neutral",
) -> None:
    with _conn() as con:
        con.execute("""
            UPDATE heartbeat_log
            SET completed_at = ?, agents_run = ?, actions_taken = ?,
                errors = ?, summary = ?, market_sentiment = ?
            WHERE heartbeat_id = ?
        """, (time.time(), agents_run, actions_taken, errors,
              summary, market_sentiment, heartbeat_id))


def get_heartbeat_history(limit: int = 10) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT * FROM heartbeat_log
            ORDER BY started_at DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


# ─── Skill Graph ──────────────────────────────────────────────────────────────

def update_skill_metrics(
    skill_id: str,
    agent_name: str,
    proficiency: int,
    success: bool,
) -> None:
    now = time.time()
    with _conn() as con:
        con.execute("""
            INSERT INTO skill_graph
                (skill_id, agent_name, proficiency, use_count, success_count, last_used)
            VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(skill_id, agent_name) DO UPDATE SET
                proficiency   = excluded.proficiency,
                use_count     = skill_graph.use_count + 1,
                success_count = skill_graph.success_count + ?,
                last_used     = excluded.last_used
        """, (skill_id, agent_name, proficiency, 1 if success else 0,
              now, 1 if success else 0))


def get_top_skills(limit: int = 20) -> list[dict]:
    """Skills ranked by success rate across the swarm."""
    with _conn() as con:
        rows = con.execute("""
            SELECT skill_id,
                   COUNT(DISTINCT agent_name) as agent_count,
                   AVG(proficiency) as avg_proficiency,
                   SUM(use_count) as total_uses,
                   SUM(success_count) * 1.0 / MAX(SUM(use_count), 1) as success_rate
            FROM skill_graph
            GROUP BY skill_id
            ORDER BY success_rate DESC, total_uses DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]
