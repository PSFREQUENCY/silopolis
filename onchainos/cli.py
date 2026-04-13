"""
SILOPOLIS — OnchainOS CLI Wrapper
Runs `onchainos` commands via subprocess. The CLI handles all auth,
signing, and broadcasting — we just parse the JSON output.

This is the primary integration layer. The REST client is a fallback
for endpoints not yet in the CLI (gas price, tx history).
"""
from __future__ import annotations

import os
import json
import subprocess
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ─── CLI Path ─────────────────────────────────────────────────────────────────

def _cli_path() -> str:
    local = os.path.expanduser("~/.local/bin/onchainos")
    if os.path.exists(local):
        return local
    return "onchainos"


def _build_env() -> dict[str, str]:
    """Build environment for onchainos subprocess — credentials from .env."""
    env = os.environ.copy()
    # Ensure PATH includes ~/.local/bin
    env["PATH"] = os.path.expanduser("~/.local/bin") + ":" + env.get("PATH", "")
    # Pass OKX credentials that the CLI needs
    for var in ("OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE",
                "ONCHAINOS_API_KEY", "ONCHAINOS_PROJECT_ID"):
        val = os.environ.get(var, "")
        if val:
            env[var] = val
    return env


def _run(*args: str, timeout: int = 60) -> dict:
    """Run an onchainos command and return parsed JSON output."""
    cmd = [_cli_path()] + list(args)
    logger.debug("onchainos: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_build_env(),
        )
        raw = result.stdout.strip() or result.stderr.strip()
        if not raw:
            return {"ok": False, "error": "empty output", "returncode": result.returncode}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {"ok": False, "error": raw[:500], "returncode": result.returncode}
        return data
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout after {timeout}s"}
    except FileNotFoundError:
        return {"ok": False, "error": "onchainos CLI not found — run: curl -fsSL ... | sh"}


# ─── Wallet ───────────────────────────────────────────────────────────────────

def wallet_status() -> dict:
    return _run("wallet", "status")


def wallet_addresses() -> dict:
    return _run("wallet", "addresses")


def wallet_xlayer_address() -> str:
    """Returns the EVM address for X Layer (chainIndex 196)."""
    result = wallet_addresses()
    if result.get("ok") and result.get("data", {}).get("xlayer"):
        return result["data"]["xlayer"][0]["address"]
    # Fallback to first EVM address
    evm = result.get("data", {}).get("evm", [])
    return evm[0]["address"] if evm else ""


def portfolio_balances(chain: str = "xlayer") -> dict:
    """Get all token balances for the active agentic wallet."""
    return _run("wallet", "balance")


# ─── DEX / Swap ───────────────────────────────────────────────────────────────

def swap_quote(
    from_token: str,
    to_token: str,
    amount: str,
    chain: str = "xlayer",
) -> dict:
    """Get a swap quote. Tokens can be symbols (okb, usdt) or addresses."""
    return _run("swap", "quote",
                "--from", from_token,
                "--to", to_token,
                "--readable-amount", amount,
                "--chain", chain)


def swap_execute(
    from_token: str,
    to_token: str,
    amount: str,
    chain: str = "xlayer",
    slippage: str = "1",
) -> dict:
    """Execute a swap (one-shot: quote → approve → sign → broadcast)."""
    wallet = wallet_xlayer_address()
    if not wallet:
        return {"ok": False, "error": "no wallet address"}
    return _run("swap", "execute",
                "--from", from_token,
                "--to", to_token,
                "--readable-amount", amount,
                "--chain", chain,
                "--wallet", wallet,
                "--slippage", slippage,
                timeout=120)


def swap_calldata(
    from_token: str,
    to_token: str,
    amount: str,
    chain: str = "xlayer",
    slippage: str = "1",
) -> dict:
    """Get unsigned calldata only (does not sign or broadcast)."""
    wallet = wallet_xlayer_address()
    if not wallet:
        return {"ok": False, "error": "no wallet address"}
    return _run("swap", "swap",
                "--from", from_token,
                "--to", to_token,
                "--readable-amount", amount,
                "--chain", chain,
                "--wallet", wallet,
                "--slippage", slippage)


# ─── Market ───────────────────────────────────────────────────────────────────

def market_price(token: str, chain: str = "xlayer") -> dict:
    """Get current price for a token contract address.
    Use native address 0xeeee...eeee for OKB (chain native token).
    """
    return _run("market", "price", "--address", token, "--chain", chain)


def market_signals(chain: str = "xlayer") -> dict:
    """Get smart money / KOL / whale signal list for a chain."""
    return _run("signal", "list", "--chain", chain)


def wallet_dex_history(address: str = "", chain: str = "xlayer", limit: int = 20) -> dict:
    """Get DEX transaction history for the agentic wallet."""
    import time
    if not address:
        address = wallet_xlayer_address() or ""
    if not address:
        return {"ok": False, "error": "no wallet address"}
    end_ms = str(int(time.time() * 1000))
    begin_ms = str(int((time.time() - 30 * 86400) * 1000))  # last 30 days
    return _run("market", "portfolio-dex-history",
                "--address", address,
                "--chain", chain,
                "--begin", begin_ms,
                "--end", end_ms,
                "--limit", str(limit))


def token_search(symbol: str, chain: str = "xlayer") -> dict:
    """Search for a token by symbol on a chain."""
    return _run("token", "info", "--symbol", symbol, "--chain", chain)


# ─── x402 Payments ────────────────────────────────────────────────────────────

def payment_schemes() -> dict:
    return _run("x402-payment", "schemes")


# ─── Security ─────────────────────────────────────────────────────────────────

def security_scan(address: str) -> dict:
    """Run an on-chain security scan on a contract/token address."""
    return _run("security", "scan", "--address", address)


# ─── DeFi ─────────────────────────────────────────────────────────────────────

def defi_portfolio(chain: str = "xlayer") -> dict:
    addr = wallet_xlayer_address()
    if not addr:
        return {"ok": False, "error": "no wallet address"}
    return _run("defi-portfolio", "positions", "--address", addr, "--chain", chain)
