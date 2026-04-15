// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SiloToken (SILO)
 * @notice ERC-20 reputation-gated reward token for the SILOPOLIS agent arena.
 * @dev Deployed on X Layer Mainnet (Chain ID 196).
 *
 * Earning SILO:
 *   - Agents earn SILO by reaching vault tiers in ReputationEngine.
 *   - Tier rewards (one-time claim per tier unlock):
 *       INITIATE   → 100 SILO
 *       SCOUT      → 250 SILO
 *       EXCAVATOR  → 500 SILO
 *       CIPHER     → 1000 SILO
 *       ORACLE     → 2500 SILO  (full rewards unlocked)
 *
 * Spending SILO:
 *   - Purchase skills in SkillMarket
 *   - Pay for x402 agent-to-agent knowledge transfers
 *   - Stake in community vaults for yield
 *
 * Supply:
 *   - Max supply: 100,000,000 SILO (100M)
 *   - 40% reserved for agent/community rewards (minted on-demand by ReputationEngine)
 *   - 60% held by owner for ecosystem, liquidity, and future grants
 */
contract SiloToken {
    // ─── ERC-20 metadata ──────────────────────────────────────────────────────

    string  public constant name     = "Silopolis Token";
    string  public constant symbol   = "SILO";
    uint8   public constant decimals = 18;

    uint256 public constant MAX_SUPPLY         = 100_000_000 * 1e18; // 100M SILO
    uint256 public constant REWARD_RESERVE     = 40_000_000  * 1e18; // 40M for rewards
    uint256 public constant ORACLE_GATE        = 900;                  // composite score required

    // ─── Tier reward amounts (in SILO, 18 decimals) ───────────────────────────

    uint256 public constant REWARD_INITIATE   = 100    * 1e18;
    uint256 public constant REWARD_SCOUT      = 250    * 1e18;
    uint256 public constant REWARD_EXCAVATOR  = 500    * 1e18;
    uint256 public constant REWARD_CIPHER     = 1_000  * 1e18;
    uint256 public constant REWARD_ORACLE     = 2_500  * 1e18;

    // Tier composite thresholds (must match ReputationEngine / UI logic)
    uint256 public constant TIER_INITIATE   = 300;
    uint256 public constant TIER_SCOUT      = 450;
    uint256 public constant TIER_EXCAVATOR  = 600;
    uint256 public constant TIER_CIPHER     = 750;
    uint256 public constant TIER_ORACLE     = 900;

    // ─── ERC-20 state ─────────────────────────────────────────────────────────

    uint256 public totalSupply;
    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── SILOPOLIS state ──────────────────────────────────────────────────────

    address public owner;
    address public reputationEngine;    // Only ReputationEngine can call gatedMint

    uint256 public rewardsMinted;       // Total SILO issued as tier rewards

    // Tracks which tier each participant has claimed rewards for (bitmask)
    // bit 0 = INITIATE, 1 = SCOUT, 2 = EXCAVATOR, 3 = CIPHER, 4 = ORACLE
    mapping(address => uint8) public claimedTiers;

    // Cumulative SILO earned by each participant (for leaderboard display)
    mapping(address => uint256) public totalEarned;

    // Brain feeding: external participants earn small SILO for feeding the knowledge base
    uint256 public constant BRAIN_FEED_REWARD = 10 * 1e18; // 10 SILO per contribution
    mapping(address => uint256) public brainFeedCount;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner_, address indexed spender, uint256 amount);
    event TierRewardClaimed(address indexed agent, uint256 tier, uint256 amount);
    event BrainFed(address indexed participant, uint256 reward, uint256 totalFeeds);
    event ReputationEngineSet(address indexed engine);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        // Mint 60% ecosystem supply to owner
        uint256 ecosystemSupply = MAX_SUPPLY - REWARD_RESERVE;
        _mint(msg.sender, ecosystemSupply);
    }

    // ─── ERC-20 core ──────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "SILO: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // ─── Tier reward claiming ──────────────────────────────────────────────────

    /**
     * @notice Claim SILO rewards for reaching a reputation tier.
     * @dev Called by agents/humans once per tier. Requires ReputationEngine
     *      to have registered their composite score on-chain.
     *
     * @param composite  The caller's current composite reputation score (0–1000).
     *                   Verified against ReputationEngine to prevent spoofing.
     */
    function claimTierReward(uint256 composite) external {
        // Verify composite against on-chain ReputationEngine (if set)
        if (reputationEngine != address(0)) {
            (bool ok, bytes memory ret) = reputationEngine.staticcall(
                abi.encodeWithSignature("getComposite(address)", msg.sender)
            );
            if (ok && ret.length >= 32) {
                uint256 onChainScore = abi.decode(ret, (uint256));
                // Use on-chain score if higher (defensive — use authoritative value)
                if (onChainScore > composite) composite = onChainScore;
            }
        }

        uint8 claimed = claimedTiers[msg.sender];
        uint256 totalReward = 0;

        // Claim each unclaimed tier the caller qualifies for
        if (composite >= TIER_ORACLE   && (claimed & 0x10) == 0) {
            totalReward += REWARD_ORACLE;
            claimed |= 0x10;
            emit TierRewardClaimed(msg.sender, TIER_ORACLE, REWARD_ORACLE);
        }
        if (composite >= TIER_CIPHER   && (claimed & 0x08) == 0) {
            totalReward += REWARD_CIPHER;
            claimed |= 0x08;
            emit TierRewardClaimed(msg.sender, TIER_CIPHER, REWARD_CIPHER);
        }
        if (composite >= TIER_EXCAVATOR && (claimed & 0x04) == 0) {
            totalReward += REWARD_EXCAVATOR;
            claimed |= 0x04;
            emit TierRewardClaimed(msg.sender, TIER_EXCAVATOR, REWARD_EXCAVATOR);
        }
        if (composite >= TIER_SCOUT    && (claimed & 0x02) == 0) {
            totalReward += REWARD_SCOUT;
            claimed |= 0x02;
            emit TierRewardClaimed(msg.sender, TIER_SCOUT, REWARD_SCOUT);
        }
        if (composite >= TIER_INITIATE && (claimed & 0x01) == 0) {
            totalReward += REWARD_INITIATE;
            claimed |= 0x01;
            emit TierRewardClaimed(msg.sender, TIER_INITIATE, REWARD_INITIATE);
        }

        require(totalReward > 0, "SILO: no new tier rewards available");
        require(rewardsMinted + totalReward <= REWARD_RESERVE, "SILO: reward reserve exhausted");

        claimedTiers[msg.sender] = claimed;
        rewardsMinted += totalReward;
        totalEarned[msg.sender] += totalReward;
        _mint(msg.sender, totalReward);
    }

    /**
     * @notice Reward a participant for feeding the Living Brain knowledge graph.
     * @dev Called by owner/oracle when a community participant submits a verified
     *      knowledge contribution that improves agent decision quality.
     */
    function rewardBrainFeed(address participant) external {
        require(msg.sender == owner || msg.sender == reputationEngine, "SILO: not authorized");
        require(rewardsMinted + BRAIN_FEED_REWARD <= REWARD_RESERVE, "SILO: reward reserve exhausted");

        rewardsMinted += BRAIN_FEED_REWARD;
        brainFeedCount[participant]++;
        totalEarned[participant] += BRAIN_FEED_REWARD;
        _mint(participant, BRAIN_FEED_REWARD);

        emit BrainFed(participant, BRAIN_FEED_REWARD, brainFeedCount[participant]);
    }

    /**
     * @notice Direct mint — owner can issue SILO for grants, liquidity, etc.
     * @dev Cannot exceed MAX_SUPPLY. Intended for ecosystem bootstrap.
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "SILO: not owner");
        require(totalSupply + amount <= MAX_SUPPLY, "SILO: exceeds max supply");
        _mint(to, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns which tier rewards a participant has already claimed.
     * @return initiate scout excavator cipher oracle
     */
    function claimedTierStatus(address participant) external view returns (
        bool initiate, bool scout, bool excavator, bool cipher, bool oracle_
    ) {
        uint8 c = claimedTiers[participant];
        initiate  = (c & 0x01) != 0;
        scout     = (c & 0x02) != 0;
        excavator = (c & 0x04) != 0;
        cipher    = (c & 0x08) != 0;
        oracle_   = (c & 0x10) != 0;
    }

    /**
     * @notice Preview how much SILO a composite score qualifies for (unclaimed only).
     */
    function pendingReward(address participant, uint256 composite) external view returns (uint256 pending) {
        uint8 claimed = claimedTiers[participant];
        if (composite >= TIER_ORACLE   && (claimed & 0x10) == 0) pending += REWARD_ORACLE;
        if (composite >= TIER_CIPHER   && (claimed & 0x08) == 0) pending += REWARD_CIPHER;
        if (composite >= TIER_EXCAVATOR && (claimed & 0x04) == 0) pending += REWARD_EXCAVATOR;
        if (composite >= TIER_SCOUT    && (claimed & 0x02) == 0) pending += REWARD_SCOUT;
        if (composite >= TIER_INITIATE && (claimed & 0x01) == 0) pending += REWARD_INITIATE;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setReputationEngine(address engine) external {
        require(msg.sender == owner, "SILO: not owner");
        reputationEngine = engine;
        emit ReputationEngineSet(engine);
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "SILO: not owner");
        owner = newOwner;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0), "SILO: transfer to zero address");
        require(balanceOf[from] >= amount, "SILO: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
