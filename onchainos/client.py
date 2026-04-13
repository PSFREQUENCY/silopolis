"""
SILOPOLIS — OnchainOS Client
Thin, secure wrapper around OnchainOS REST APIs.
All credentials loaded from environment — never hardcoded.
"""
from __future__ import annotations

import os
import time
import hmac
import hashlib
import base64
import json
from datetime import datetime, timezone
from typing import Any

import httpx


class OnchainOSError(Exception):
    """Raised when OnchainOS API returns an error response."""
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(f"[{code}] {message}")


def _load_required(var: str) -> str:
    val = os.environ.get(var, "").strip()
    if not val:
        raise EnvironmentError(
            f"Required env var {var!r} is not set. "
            "Copy .env.example to .env and fill in real values."
        )
    return val


def _okx_signature(
    api_key: str,
    secret_key: str,
    passphrase: str,
    method: str,
    path: str,
    body: str = "",
) -> dict[str, str]:
    """Generate OKX HMAC-SHA256 request headers."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    pre_hash = timestamp + method.upper() + path + body
    sig = base64.b64encode(
        hmac.new(secret_key.encode(), pre_hash.encode(), hashlib.sha256).digest()
    ).decode()
    return {
        "OK-ACCESS-KEY":        api_key,
        "OK-ACCESS-SIGN":       sig,
        "OK-ACCESS-TIMESTAMP":  timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type":         "application/json",
    }


class OnchainOSClient:
    """
    OnchainOS API client — Wallet, DEX/Trade, Market, Payments.
    Credentials sourced exclusively from environment variables.
    """

    BASE_URL = "https://www.okx.com"

    def __init__(self) -> None:
        self._api_key    = _load_required("ONCHAINOS_API_KEY")
        self._secret     = _load_required("ONCHAINOS_SECRET_KEY")
        self._passphrase = _load_required("ONCHAINOS_PASSPHRASE")
        self._project_id = os.environ.get("ONCHAINOS_PROJECT_ID", "")
        self._chain_id   = os.environ.get("XLAYER_CHAIN_ID", "196")
        self._client     = httpx.Client(timeout=30.0)

    def _headers(self, method: str, path: str, body: str = "") -> dict:
        h = _okx_signature(
            self._api_key, self._secret, self._passphrase, method, path, body
        )
        if self._project_id:
            h["OK-ACCESS-PROJECT"] = self._project_id
        return h

    def _get(self, path: str, params: dict | None = None) -> Any:
        qs = ""
        if params:
            qs = "?" + "&".join(f"{k}={v}" for k, v in params.items())
        full_path = path + qs
        resp = self._client.get(
            self.BASE_URL + full_path,
            headers=self._headers("GET", full_path),
        )
        return self._handle(resp)

    def _post(self, path: str, payload: dict) -> Any:
        body = json.dumps(payload)
        resp = self._client.post(
            self.BASE_URL + path,
            headers=self._headers("POST", path, body),
            content=body,
        )
        return self._handle(resp)

    @staticmethod
    def _handle(resp: httpx.Response) -> Any:
        resp.raise_for_status()
        data = resp.json()
        # OnchainOS wraps errors in {"code": "...", "msg": "..."}
        if isinstance(data, dict) and data.get("code") not in (None, "0", 0):
            raise OnchainOSError(str(data.get("code")), data.get("msg", "unknown"))
        return data

    # ─── Wallet / Balance ─────────────────────────────────────────────────────

    def get_total_value(self, address: str) -> dict:
        """Get total portfolio value for an address on X Layer."""
        return self._get(
            "/api/v5/wallet/asset/total-value",
            params={"address": address, "chains": self._chain_id},
        )

    def get_token_balances(self, address: str) -> dict:
        return self._get(
            "/api/v5/wallet/asset/all-token-balances-by-address",
            params={"address": address, "chains": self._chain_id},
        )

    def get_tx_history(self, address: str, limit: int = 20) -> dict:
        return self._get(
            "/api/v5/wallet/post-transaction/transactions-by-address",
            params={"address": address, "chainIndex": self._chain_id, "limit": str(limit)},
        )

    # ─── DEX / Trade ──────────────────────────────────────────────────────────

    def get_swap_quote(
        self,
        from_token: str,
        to_token: str,
        amount: str,
        slippage: str = "0.5",
    ) -> dict:
        """Get a DEX swap quote via OnchainOS aggregator."""
        return self._get(
            "/api/v5/dex/aggregator/quote",
            params={
                "chainId":       self._chain_id,
                "fromTokenAddress": from_token,
                "toTokenAddress":   to_token,
                "amount":           amount,
                "slippage":         slippage,
            },
        )

    def get_swap_tx(
        self,
        from_token: str,
        to_token: str,
        amount: str,
        user_address: str,
        slippage: str = "0.5",
    ) -> dict:
        """Build a swap transaction (unsigned) ready for signing."""
        return self._get(
            "/api/v5/dex/aggregator/swap",
            params={
                "chainId":           self._chain_id,
                "fromTokenAddress":  from_token,
                "toTokenAddress":    to_token,
                "amount":            amount,
                "userWalletAddress": user_address,
                "slippage":          slippage,
            },
        )

    def broadcast_tx(self, signed_tx: str) -> dict:
        """Broadcast a signed transaction via OnchainOS gateway."""
        return self._post(
            "/api/v5/wallet/pre-transaction/broadcast-transaction",
            {"signedTx": signed_tx, "chainIndex": self._chain_id},
        )

    def get_gas_price(self) -> dict:
        return self._get(
            "/api/v5/wallet/pre-transaction/gas-price",
            params={"chainIndex": self._chain_id},
        )

    # ─── Market Data ──────────────────────────────────────────────────────────

    def get_price(self, token_address: str) -> dict:
        return self._get(
            "/api/v5/market/index-price",
            params={"chainIndex": self._chain_id, "tokenContractAddress": token_address},
        )

    def get_token_ranking(self, limit: int = 20) -> dict:
        return self._get(
            "/api/v5/market/token/ranking",
            params={"chainIndex": self._chain_id, "limit": str(limit)},
        )

    # ─── x402 Payments ────────────────────────────────────────────────────────

    def get_payment_schemes(self) -> dict:
        return self._get("/api/v5/payments/info/schemes")

    def submit_payment(self, payment_payload: dict) -> dict:
        return self._post("/api/v5/payments/transaction/submit", payment_payload)

    def verify_payment(self, tx_hash: str) -> dict:
        return self._get(
            "/api/v5/payments/transaction/verify",
            params={"txHash": tx_hash, "chainIndex": self._chain_id},
        )
