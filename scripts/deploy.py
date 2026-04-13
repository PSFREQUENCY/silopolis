"""
SILOPOLIS — Contract Deployment Script
Deploys AgentRegistry, ReputationEngine, SkillMarket to X Layer mainnet.

Usage:
  DEPLOYER_PRIVATE_KEY=0x... python3 scripts/deploy.py

Or add DEPLOYER_PRIVATE_KEY to .env first.
The deployer can be any funded wallet — personal OKX wallet, MetaMask, etc.
(NOT the Agentic Wallet — that uses TEE and doesn't expose private keys)
"""
import os, sys, json, subprocess
from pathlib import Path

# ── Load .env ──────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                if k.strip() not in os.environ:
                    os.environ[k.strip()] = v.strip()

from web3 import Web3
from eth_account import Account

# ── Config ────────────────────────────────────────────────────────────────────

RPC      = os.environ.get("XLAYER_RPC_URL", "https://rpc.xlayer.tech")
PRIV_KEY = os.environ.get("DEPLOYER_PRIVATE_KEY", "").strip()

if not PRIV_KEY or len(PRIV_KEY) < 60:
    print("❌ DEPLOYER_PRIVATE_KEY not set or invalid in .env")
    print("   Add your personal wallet private key (64 hex chars, with or without 0x)")
    print("   This is NOT the Agentic Wallet — use MetaMask/OKX Web3 wallet key")
    sys.exit(1)

if not PRIV_KEY.startswith("0x"):
    PRIV_KEY = "0x" + PRIV_KEY

# ── Connect ───────────────────────────────────────────────────────────────────

w3 = Web3(Web3.HTTPProvider(RPC))
if not w3.is_connected():
    print(f"❌ Cannot connect to {RPC}")
    sys.exit(1)

account = Account.from_key(PRIV_KEY)
print(f"Connected to X Layer (chain {w3.eth.chain_id})")
print(f"Deployer: {account.address}")
balance = w3.eth.get_balance(account.address)
print(f"Balance:  {w3.from_wei(balance, 'ether'):.6f} OKB")

if balance < w3.to_wei(0.0001, "ether"):
    print("❌ Deployer balance too low — need at least 0.0001 OKB")
    sys.exit(1)

# ── Load compiled artifacts ───────────────────────────────────────────────────

contracts_dir = Path(__file__).parent.parent / "contracts"
out_dir = contracts_dir / "out"

def load_contract(name: str):
    artifact = out_dir / f"{name}.sol" / f"{name}.json"
    if not artifact.exists():
        print(f"❌ Artifact not found: {artifact}")
        print("   Run: cd contracts && forge build")
        sys.exit(1)
    with open(artifact) as f:
        art = json.load(f)
    return art["abi"], art["bytecode"]["object"]

# ── Deploy ────────────────────────────────────────────────────────────────────

# Track nonce manually so sequential deploys don't collide
_nonce = w3.eth.get_transaction_count(account.address, "pending")

def deploy(name: str, abi, bytecode, *constructor_args):
    global _nonce
    print(f"\n📦 Deploying {name}...")
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    gas_price = w3.eth.gas_price

    tx = contract.constructor(*constructor_args).build_transaction({
        "from":     account.address,
        "nonce":    _nonce,
        "gasPrice": gas_price,
        "chainId":  w3.eth.chain_id,
    })
    tx["gas"] = w3.eth.estimate_gas(tx)

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    _nonce += 1   # increment immediately so next deploy doesn't collide
    print(f"   TX: 0x{tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    addr = receipt.contractAddress
    gas_used = receipt.gasUsed
    cost_okb = w3.from_wei(gas_price * gas_used, "ether")
    print(f"   ✅ {name}: {addr}")
    print(f"   Gas: {gas_used:,} | Cost: {cost_okb:.8f} OKB")
    return addr

registry_abi, registry_bc   = load_contract("AgentRegistry")
rep_abi,      rep_bc         = load_contract("ReputationEngine")
skill_abi,    skill_bc       = load_contract("SkillMarket")

print("\n=== Deploying SILOPOLIS contracts to X Layer mainnet ===")

registry_addr = deploy("AgentRegistry",   registry_abi, registry_bc)
rep_addr      = deploy("ReputationEngine", rep_abi, rep_bc, registry_addr)
skill_addr    = deploy("SkillMarket",      skill_abi, skill_bc)

# ── Save addresses ────────────────────────────────────────────────────────────

print("\n=== Updating .env with contract addresses ===")
env_content = env_path.read_text()
env_content = env_content.replace("AGENT_REGISTRY_ADDRESS=",    f"AGENT_REGISTRY_ADDRESS={registry_addr}")
env_content = env_content.replace("REPUTATION_ENGINE_ADDRESS=", f"REPUTATION_ENGINE_ADDRESS={rep_addr}")
env_content = env_content.replace("SKILL_MARKET_ADDRESS=",      f"SKILL_MARKET_ADDRESS={skill_addr}")
env_path.write_text(env_content)

print(f"\n✅ SILOPOLIS contracts live on X Layer mainnet!")
print(f"   AgentRegistry:    {registry_addr}")
print(f"   ReputationEngine: {rep_addr}")
print(f"   SkillMarket:      {skill_addr}")
print(f"\n   Explorer: https://www.oklink.com/xlayer/address/{registry_addr}")
print(f"\n   Update README.md with these addresses before submitting!")
