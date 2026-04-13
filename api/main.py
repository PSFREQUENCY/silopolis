"""
SILOPOLIS — FastAPI Backend
Exposes swarm status, leaderboard, agent actions, and skill marketplace.
Designed for Vercel serverless deployment (api/ directory).
"""
from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.swarm import Swarm
from core.agent import SiloAgent, Skill
from core.agents.trader import TraderAgent
from core import memory as mem
from core.risk import RiskGovernor as _RiskGovernor

logging.basicConfig(level=os.environ.get("SILOPOLIS_LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# ─── Global Swarm Instance ────────────────────────────────────────────────────

_swarm: Swarm | None = None


def get_swarm() -> Swarm:
    global _swarm
    if _swarm is None:
        _swarm = Swarm(
            max_workers=int(os.environ.get("SILOPOLIS_SWARM_SIZE", "3")),
            global_spend_cap_usd=float(os.environ.get("SILOPOLIS_MAX_SPEND_PER_DAY_USD", "50")),
            cycle_interval_sec=60.0,
        )
        # Seed initial agents (wallet addresses populated from env or config)
        wallet = os.environ.get("AGENT_WALLET_ADDRESS", "0x0000000000000000000000000000000000000000")

        agents: list[SiloAgent] = [
            TraderAgent("SILO-TRADER-1", wallet, min_profit_bps=20, max_trade_usd=5.0),
            TraderAgent("SILO-TRADER-2", wallet, min_profit_bps=30, max_trade_usd=3.0),
        ]
        # Seed a bootstrap skill for each
        bootstrap_skill = Skill(
            skill_id="xlayer-dex-basics",
            name="X Layer DEX Basics",
            category="trading",
            schema={
                "description": "Fundamental DEX swap operations on X Layer via OnchainOS",
                "actions": ["get_quote", "execute_swap", "check_slippage"],
            },
            proficiency=70,
        )
        for agent in agents:
            agent.acquire_skill(bootstrap_skill)
            _swarm.add_agent(agent)

    return _swarm


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the swarm
    get_swarm()
    yield


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SILOPOLIS",
    description="Autonomous AI agent swarm marketplace on X Layer",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth ─────────────────────────────────────────────────────────────────────

def verify_api_key(x_api_key: str = Header(default="")) -> str:
    """
    Simple API key auth for write endpoints.
    Key loaded from environment — never hardcoded.
    """
    expected = os.environ.get("SILOPOLIS_ADMIN_KEY", "")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

# ─── Models ───────────────────────────────────────────────────────────────────

class SkillAcquireRequest(BaseModel):
    agent_name: str
    skill_id: str
    skill_name: str
    category: str
    description: str
    proficiency: int = 50

class ThinkRequest(BaseModel):
    agent_name: str
    prompt: str

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "SILOPOLIS",
        "tagline": "Autonomous AI agent arena on X Layer",
        "chain": "X Layer (Chain ID 196)",
        "status": "live",
    }


@app.get("/api/status")
def swarm_status(swarm: Swarm = Depends(get_swarm)):
    return swarm.status()


@app.get("/api/leaderboard")
def leaderboard(swarm: Swarm = Depends(get_swarm)):
    """Reputation leaderboard across all agents in the swarm."""
    return {"leaderboard": swarm.leaderboard()}


@app.get("/api/agents/{agent_name}")
def agent_detail(agent_name: str, swarm: Swarm = Depends(get_swarm)):
    agent = swarm.agents.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")
    return agent.status()


@app.get("/api/agents/{agent_name}/memory")
def agent_memory(agent_name: str, swarm: Swarm = Depends(get_swarm)):
    agent = swarm.agents.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")
    return {"memory": agent.memory[-50:]}  # Last 50 events


@app.post("/api/swarm/cycle")
def run_cycle(_key: str = Depends(verify_api_key), swarm: Swarm = Depends(get_swarm)):
    """Trigger one swarm cycle manually (for demo / testing)."""
    results = swarm.run_once()
    return {"results": results, "cycle_count": swarm._cycle_count}


@app.post("/api/swarm/sync-knowledge")
def sync_knowledge(_key: str = Depends(verify_api_key), swarm: Swarm = Depends(get_swarm)):
    """Trigger a cross-agent skill sync."""
    transfers = swarm.sync_knowledge()
    return {"transfers": transfers}


@app.post("/api/agents/acquire-skill")
def acquire_skill(
    req: SkillAcquireRequest,
    _key: str = Depends(verify_api_key),
    swarm: Swarm = Depends(get_swarm),
):
    agent = swarm.agents.get(req.agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {req.agent_name!r} not found")

    skill = Skill(
        skill_id=req.skill_id,
        name=req.skill_name,
        category=req.category,
        schema={"description": req.description},
        proficiency=min(100, max(0, req.proficiency)),
    )
    agent.acquire_skill(skill)
    return {"success": True, "agent": req.agent_name, "skill": req.skill_id}


@app.post("/api/agents/think")
def agent_think(
    req: ThinkRequest,
    _key: str = Depends(verify_api_key),
    swarm: Swarm = Depends(get_swarm),
):
    """Ask a specific agent to reason about a prompt (costs LLM tokens)."""
    agent = swarm.agents.get(req.agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {req.agent_name!r} not found")
    try:
        response = agent.think(req.prompt)
        return {"agent": req.agent_name, "response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/heartbeat/status")
def heartbeat_status():
    """Live heartbeat status — used by the dashboard timer widget."""
    try:
        mem.init_db()
        history = mem.get_heartbeat_history(limit=1)
        last = history[0] if history else None
        all_hb = mem.get_heartbeat_history(limit=1000)
        return {
            "last_heartbeat": last,
            "total_cycles": len(all_hb),
            "running": False,  # set True if heartbeat process is active
            "next_interval_sec": 28800,
        }
    except Exception as e:
        return {"last_heartbeat": None, "total_cycles": 0, "running": False, "error": str(e)}


@app.get("/api/knowledge")
def swarm_knowledge(limit: int = 50):
    """Return collective swarm knowledge for dashboard display."""
    try:
        mem.init_db()
        return {"knowledge": mem.get_swarm_knowledge(min_confidence=0.3, limit=limit)}
    except Exception as e:
        return {"knowledge": [], "error": str(e)}


@app.get("/api/risk")
def risk_status():
    """Live vault risk profile — tier, balance, win rate, profit capture."""
    try:
        rg = _RiskGovernor()
        return rg.status_dict()
    except Exception as e:
        return {"error": str(e), "tier": "UNKNOWN"}


@app.get("/api/contracts")
def contract_addresses():
    """Return deployed contract addresses."""
    return {
        "network": "X Layer",
        "chain_id": 196,
        "contracts": {
            "AgentRegistry":    os.environ.get("AGENT_REGISTRY_ADDRESS", ""),
            "ReputationEngine": os.environ.get("REPUTATION_ENGINE_ADDRESS", ""),
            "SkillMarket":      os.environ.get("SKILL_MARKET_ADDRESS", ""),
        },
        "explorer_base": "https://www.oklink.com/xlayer/address/",
        "wallet": os.environ.get("AGENT_WALLET_ADDRESS", ""),
    }


@app.get("/health")
def health():
    return {"ok": True}
