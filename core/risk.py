"""
SILOPOLIS — Risk Governor & Profit Tracker
Manages the entire treasury from first $1 with a conservative growth profile.

Philosophy:
  - X Layer is gasless → activity is FREE. Generate as many on-chain signals
    as possible without spending OKB on gas.
  - Trades start micro (0.001 OKB) and scale ONLY when proven profitable.
  - Every profit is captured: 50% stays in vault, 50% compounds into next trade.
  - Every loss is logged. 5 consecutive significant losses → pause trading for 1 cycle.
  - Mastery is demonstrated by improving win rate over time, not just activity.

Risk Tiers (auto-scales as vault grows):
  SEED    0.000–0.001 OKB  → observe only, zero trades, build knowledge
  MICRO   0.001–0.010 OKB  → tiny swaps (0.0001 OKB), prove the system
  SMALL   0.010–0.050 OKB  → up to 0.001 OKB per trade, compound winners
  MEDIUM  0.050–0.200 OKB  → up to 0.005 OKB per trade, active rebalance
  ACTIVE  0.200+     OKB   → up to 1% of vault per trade, full LP strategy
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Risk Tier Config ────────────────────────────────────────────────────────

@dataclass
class RiskTier:
    name: str
    min_okb: float
    max_trade_okb: float        # max per single swap
    max_daily_okb: float        # total OKB tradeable per day
    min_confidence: int         # confidence threshold to act (0–100)
    allow_lp: bool              # whether to do LP positions
    allow_trading: bool         # whether to execute swaps
    description: str


RISK_TIERS = [
    RiskTier("SEED",   0.000, 0.00000, 0.00000, 100, False, False,
             "Vault too small — observe markets, build knowledge, zero risk"),
    RiskTier("MICRO",  0.001, 0.00010, 0.00500,  60, False, True,
             "MICRO TIER ACTIVATED · Accumulating OKB · Building vault foundation"),
    RiskTier("SMALL",  0.010, 0.00100, 0.00300,  50, False, True,
             "Small positions — compound winners, cut losses fast"),
    RiskTier("MEDIUM", 0.050, 0.00500, 0.01500,  40, True,  True,
             "Active trading + LP — rebalance on each heartbeat"),
    RiskTier("ACTIVE", 0.200, 0.00000, 0.00000,  35, True,  True,
             "Full strategy — 1% vault per trade, LP + DEX arb"),
]


# ─── Vault State ─────────────────────────────────────────────────────────────

@dataclass
class VaultState:
    okb_balance: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    total_profit_okb: float = 0.0
    consecutive_losses: int = 0
    daily_spent_okb: float = 0.0
    day_start: float = field(default_factory=time.time)
    paused_until: float = 0.0   # unix timestamp — 0 means not paused

    @property
    def win_rate(self) -> float:
        if self.total_trades == 0: return 0.0
        return self.winning_trades / self.total_trades

    @property
    def is_paused(self) -> bool:
        return time.time() < self.paused_until

    def reset_daily(self) -> None:
        if time.time() - self.day_start >= 86400:
            self.daily_spent_okb = 0.0
            self.day_start = time.time()


# ─── Risk Governor ────────────────────────────────────────────────────────────

_STATE_PATH = Path(__file__).parent.parent / "data" / "vault_state.json"


def load_vault_state() -> VaultState:
    """Load vault state from disk. Creates default if missing."""
    _STATE_PATH.parent.mkdir(exist_ok=True)
    if _STATE_PATH.exists():
        try:
            data = json.loads(_STATE_PATH.read_text())
            return VaultState(**{k: v for k, v in data.items()
                                  if k in VaultState.__dataclass_fields__})
        except Exception as e:
            logger.warning("Failed to load vault state: %s", e)
    return VaultState()


def save_vault_state(state: VaultState) -> None:
    _STATE_PATH.parent.mkdir(exist_ok=True)
    _STATE_PATH.write_text(json.dumps({
        "okb_balance":       state.okb_balance,
        "total_trades":      state.total_trades,
        "winning_trades":    state.winning_trades,
        "total_profit_okb":  state.total_profit_okb,
        "consecutive_losses": state.consecutive_losses,
        "daily_spent_okb":   state.daily_spent_okb,
        "day_start":         state.day_start,
        "paused_until":      state.paused_until,
    }, indent=2))


def get_risk_tier(okb_balance: float) -> RiskTier:
    """Return the appropriate risk tier for current vault size."""
    for tier in reversed(RISK_TIERS):
        if okb_balance >= tier.min_okb:
            return tier
    return RISK_TIERS[0]  # SEED


def get_max_trade_size(okb_balance: float, tier: RiskTier) -> float:
    """For ACTIVE tier, use 1% of vault. Otherwise use fixed max."""
    if tier.name == "ACTIVE":
        return round(okb_balance * 0.01, 6)
    return tier.max_trade_okb


class RiskGovernor:
    """
    Single source of truth for all spending decisions.
    Every trade goes through this before execution.
    """

    def __init__(self) -> None:
        self.state = load_vault_state()
        self._fetch_balance()

    def _fetch_balance(self) -> None:
        """Fetch live OKB balance — tries web3 RPC first, then OnchainOS CLI."""
        wallet = os.environ.get("AGENT_WALLET_ADDRESS", "")
        if not wallet:
            return

        # Primary: direct RPC call (most reliable)
        try:
            from web3 import Web3
            rpc = os.environ.get("XLAYER_RPC_URL", "https://xlayerrpc.okx.com")
            w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 10}))
            if w3.is_connected():
                raw_bal = w3.eth.get_balance(Web3.to_checksum_address(wallet))
                bal = float(w3.from_wei(raw_bal, "ether"))
                if bal >= 0:
                    self.state.okb_balance = bal
                    logger.info("Vault: %.6f OKB on X Layer (tier: %s)", bal, self.tier.name)
                    save_vault_state(self.state)
                    return
        except Exception as e:
            logger.debug("RPC balance fetch failed: %s", e)

        # Fallback: OnchainOS CLI portfolio
        try:
            from onchainos import cli as onchainos
            bal_raw = onchainos.portfolio_balances()
            tokens = []
            if isinstance(bal_raw, dict):
                data = bal_raw.get("data", bal_raw)
                if isinstance(data, list):
                    tokens = data
                elif isinstance(data, dict):
                    tokens = data.get("tokenAssets", data.get("tokens", []))
            elif isinstance(bal_raw, list):
                tokens = bal_raw
            for token in tokens:
                sym = (token.get("symbol") or token.get("tokenSymbol") or "").upper()
                if sym in ("OKB", "NATIVE", ""):
                    raw = token.get("balance") or token.get("tokenBalance") or token.get("amount") or "0"
                    bal = float(str(raw).replace(",", ""))
                    if bal > 0:
                        self.state.okb_balance = bal
                        logger.info("Vault (CLI): %.6f OKB (tier: %s)", bal, self.tier.name)
                        save_vault_state(self.state)
                        return
        except Exception as e:
            logger.debug("CLI balance fetch failed: %s", e)

    @property
    def tier(self) -> RiskTier:
        return get_risk_tier(self.state.okb_balance)

    # Hard floor — never trade OKB below this threshold
    OKB_FLOOR  = float(os.environ.get("SILOPOLIS_OKB_FLOOR",   "0.00222"))
    # Buffer zone — if balance < BUFFER, buybacks bypass daily limit
    OKB_BUFFER = float(os.environ.get("SILOPOLIS_OKB_BUFFER",  "0.00666"))  # 3× floor

    @property
    def needs_buyback(self) -> bool:
        """True when OKB balance is below the buffer threshold — buyback is top priority."""
        return self.state.okb_balance < self.OKB_BUFFER

    @property
    def can_buyback(self) -> bool:
        """OKB buyback is always allowed when below buffer, even if daily budget is exhausted.
        Buying OKB back is a capital preservation action, not a speculative trade."""
        self.state.reset_daily()
        if self.state.is_paused:
            return False
        if self.state.okb_balance <= self.OKB_FLOOR:
            return False  # absolutely nothing left to work with
        return self.needs_buyback  # True if below buffer

    @property
    def can_trade(self) -> bool:
        """True if conditions allow a speculative trade right now."""
        self.state.reset_daily()
        t = self.tier
        if not t.allow_trading:
            logger.info("[risk] No trading in %s tier (balance %.6f OKB)", t.name, self.state.okb_balance)
            return False
        if self.state.okb_balance <= self.OKB_FLOOR:
            logger.warning("[risk] OKB below floor (%.6f ≤ %.6f) — trading suspended until balance recovers",
                           self.state.okb_balance, self.OKB_FLOOR)
            return False
        if self.state.is_paused:
            remaining = self.state.paused_until - time.time()
            logger.info("[risk] Trading paused for %.0f more seconds", remaining)
            return False
        if self.state.daily_spent_okb >= t.max_daily_okb:
            logger.info("[risk] Daily OKB budget exhausted (%.6f / %.6f)", self.state.daily_spent_okb, t.max_daily_okb)
            return False
        return True

    def get_trade_size(self) -> float:
        """Return safe trade size — never risks dropping below OKB floor."""
        t = self.tier
        # How much OKB can we safely spend without hitting the floor
        spendable = max(0.0, self.state.okb_balance - self.OKB_FLOOR)
        base = get_max_trade_size(self.state.okb_balance, t)
        remaining_daily = t.max_daily_okb - self.state.daily_spent_okb
        return round(min(base, remaining_daily, spendable * 0.1), 6)  # max 10% of spendable

    def get_buyback_size(self) -> float:
        """Return how much OKB to buy back. Targets restoring balance to OKB_BUFFER."""
        deficit = max(0.0, self.OKB_BUFFER - self.state.okb_balance)
        # Buy enough to close 50% of the deficit in one shot (conservative)
        return round(min(deficit * 0.5, self.OKB_FLOOR), 6)

    def check_confidence(self, confidence: int) -> bool:
        """Return True if confidence meets the tier's minimum.
        SILOPOLIS_MIN_CONFIDENCE env var overrides the tier floor downward."""
        env_min = int(os.environ.get("SILOPOLIS_MIN_CONFIDENCE", "100").split()[0])
        effective_min = min(self.tier.min_confidence, env_min)
        return confidence >= effective_min

    # Minimum loss to count as a real loss (below this = DEX fee noise, not a loss)
    _LOSS_THRESHOLD = 0.000050  # 0.00005 OKB — smaller than this is just fee rounding

    def record_trade(self, spent_okb: float, profit_okb: float) -> None:
        """Record a completed trade outcome."""
        self.state.total_trades += 1
        self.state.daily_spent_okb += spent_okb

        if profit_okb >= -self._LOSS_THRESHOLD:
            # Win or break-even (micro DEX fees don't count as losses)
            self.state.winning_trades += 1
            self.state.consecutive_losses = 0
            if profit_okb > 0:
                # Capture profit: 50% back to vault, 50% available for next trade
                net = profit_okb * 0.5
                self.state.okb_balance += net
                self.state.total_profit_okb += net
                logger.info("[risk] Win: +%.6f OKB profit (captured %.6f). Win rate: %.1f%%",
                            profit_okb, net, self.state.win_rate * 100)
            else:
                logger.info("[risk] Break-even (fee noise %.8f OKB). Win rate: %.1f%%",
                            profit_okb, self.state.win_rate * 100)
        else:
            self.state.consecutive_losses += 1
            self.state.okb_balance = max(0, self.state.okb_balance - abs(profit_okb))
            logger.warning("[risk] Loss: %.6f OKB. Consecutive: %d",
                           abs(profit_okb), self.state.consecutive_losses)
            # 5 consecutive significant losses → pause for 1 cycle (8 hours)
            if self.state.consecutive_losses >= 5:
                self.state.paused_until = time.time() + 28800  # 8h
                logger.warning("[risk] 5 consecutive losses — pausing for 8h")

        save_vault_state(self.state)

    def status_dict(self) -> dict:
        t = self.tier
        return {
            "tier":              t.name,
            "description":       t.description,
            "okb_balance":       round(self.state.okb_balance, 6),
            "max_trade_okb":     get_max_trade_size(self.state.okb_balance, t),
            "daily_budget_okb":  t.max_daily_okb,
            "daily_spent_okb":   round(self.state.daily_spent_okb, 6),
            "total_trades":      self.state.total_trades,
            "winning_trades":    self.state.winning_trades,
            "win_rate_pct":      round(self.state.win_rate * 100, 1),
            "total_profit_okb":  round(self.state.total_profit_okb, 6),
            "consecutive_losses": self.state.consecutive_losses,
            "daily_budget_remaining_okb": round(max(0, t.max_daily_okb - self.state.daily_spent_okb), 6),
            "can_trade":         self.can_trade,
            "can_buyback":       self.can_buyback,
            "needs_buyback":     self.needs_buyback,
            "is_paused":         self.state.is_paused,
            "allow_lp":          t.allow_lp,
        }
