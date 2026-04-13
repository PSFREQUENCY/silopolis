// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReputationEngine
 * @notice Multi-dimensional, tamper-proof reputation scoring for SILOPOLIS agents
 * @dev All scores are stored on X Layer. Scores update with each verified interaction.
 *
 * Scoring Dimensions (each 0–1000, weighted average = ReputationScore):
 *   1. ACCURACY      — trade execution accuracy vs. stated intent
 *   2. QUALITY       — output quality assessed by peer agents
 *   3. EXECUTION     — on-chain execution success rate
 *   4. STRUCTURE     — protocol adherence & architecture compliance
 *   5. SAFETY        — no slippage violations, rug exposure, or exploits
 *   6. SECURITY      — no credential leaks or malicious calls
 *   7. COGNITION     — decision quality (complexity of successfully completed tasks)
 *   8. COLLABORATION — how well agent teaches/shares skills with others
 */
contract ReputationEngine {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_SCORE    = 1000;
    uint256 public constant DECAY_PERIOD = 30 days;  // Score decays if inactive
    uint256 public constant DECAY_RATE   = 5;        // 0.5% decay per period

    // Dimension indices
    uint8 public constant DIM_ACCURACY      = 0;
    uint8 public constant DIM_QUALITY       = 1;
    uint8 public constant DIM_EXECUTION     = 2;
    uint8 public constant DIM_STRUCTURE     = 3;
    uint8 public constant DIM_SAFETY        = 4;
    uint8 public constant DIM_SECURITY      = 5;
    uint8 public constant DIM_COGNITION     = 6;
    uint8 public constant DIM_COLLABORATION = 7;

    uint8 public constant DIMENSION_COUNT = 8;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct ReputationScore {
        uint256[8] dimensions;   // Raw scores per dimension
        uint256    composite;    // Weighted composite score
        uint256    totalEvents;  // Number of rating events
        uint256    lastUpdated;
        uint256    streak;       // Consecutive high-quality interactions
    }

    struct RatingEvent {
        address  rater;
        address  rated;
        uint8    dimension;
        uint256  score;
        string   evidenceURI;   // IPFS hash of evidence (tx hash, output hash etc.)
        uint256  timestamp;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(address => ReputationScore) public scores;
    mapping(address => RatingEvent[])   public ratingHistory;
    mapping(address => mapping(address => uint256)) public lastRatedAt; // rate-limiting

    address public agentRegistry;
    address public owner;

    uint256[8] public dimensionWeights; // out of 1000 total

    // ─── Events ───────────────────────────────────────────────────────────────

    event ScoreUpdated(address indexed agent, uint256 composite, uint256[8] dimensions);
    event RatingSubmitted(address indexed rater, address indexed rated, uint8 dimension, uint256 score);
    event StreakAchieved(address indexed agent, uint256 streak);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _agentRegistry) {
        agentRegistry = _agentRegistry;
        owner = msg.sender;

        // Default weights — equal across all 8 dimensions (125 each = 1000 total)
        for (uint8 i = 0; i < DIMENSION_COUNT; i++) {
            dimensionWeights[i] = 125;
        }
    }

    // ─── Rating ───────────────────────────────────────────────────────────────

    /**
     * @notice Submit a rating for another agent on a specific dimension
     * @param rated      Address of the agent being rated
     * @param dimension  Dimension index (0–7)
     * @param score      Score 0–1000
     * @param evidenceURI IPFS URI of evidence supporting the rating
     */
    function submitRating(
        address rated,
        uint8   dimension,
        uint256 score,
        string  calldata evidenceURI
    ) external {
        require(msg.sender != rated, "ReputationEngine: cannot self-rate");
        require(dimension < DIMENSION_COUNT, "ReputationEngine: invalid dimension");
        require(score <= MAX_SCORE, "ReputationEngine: score exceeds max");
        require(
            block.timestamp >= lastRatedAt[msg.sender][rated] + 1 hours,
            "ReputationEngine: rate limit: 1 rating per hour"
        );

        lastRatedAt[msg.sender][rated] = block.timestamp;

        ratingHistory[rated].push(RatingEvent({
            rater:       msg.sender,
            rated:       rated,
            dimension:   dimension,
            score:       score,
            evidenceURI: evidenceURI,
            timestamp:   block.timestamp
        }));

        _updateScore(rated, dimension, score);

        emit RatingSubmitted(msg.sender, rated, dimension, score);
    }

    /**
     * @notice Self-report on-chain execution results (anchored to tx evidence)
     * @dev Called by the agent after each verified on-chain action
     */
    function recordExecution(
        uint256 accuracyScore,
        uint256 executionScore,
        string  calldata txEvidenceURI
    ) external {
        require(accuracyScore  <= MAX_SCORE, "ReputationEngine: accuracy out of range");
        require(executionScore <= MAX_SCORE, "ReputationEngine: execution out of range");

        _updateScore(msg.sender, DIM_ACCURACY,  accuracyScore);
        _updateScore(msg.sender, DIM_EXECUTION, executionScore);

        ratingHistory[msg.sender].push(RatingEvent({
            rater:       msg.sender,
            rated:       msg.sender,
            dimension:   DIM_EXECUTION,
            score:       executionScore,
            evidenceURI: txEvidenceURI,
            timestamp:   block.timestamp
        }));
    }

    // ─── Internal Scoring ─────────────────────────────────────────────────────

    function _updateScore(address agent, uint8 dimension, uint256 newScore) internal {
        ReputationScore storage rep = scores[agent];

        // Exponential moving average: new = old * 0.8 + new * 0.2
        uint256 oldDim = rep.dimensions[dimension];
        uint256 updated = (oldDim * 80 + newScore * 20) / 100;
        rep.dimensions[dimension] = updated;

        // Recompute composite
        uint256 composite = 0;
        for (uint8 i = 0; i < DIMENSION_COUNT; i++) {
            composite += rep.dimensions[i] * dimensionWeights[i];
        }
        rep.composite = composite / 1000;
        rep.totalEvents++;
        rep.lastUpdated = block.timestamp;

        // Streak tracking
        if (newScore >= 800) {
            rep.streak++;
            if (rep.streak % 10 == 0) emit StreakAchieved(agent, rep.streak);
        } else if (newScore < 400) {
            rep.streak = 0;
        }

        emit ScoreUpdated(agent, rep.composite, rep.dimensions);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getScore(address agent) external view returns (ReputationScore memory) {
        return scores[agent];
    }

    function getComposite(address agent) external view returns (uint256) {
        return scores[agent].composite;
    }

    function getDimension(address agent, uint8 dimension) external view returns (uint256) {
        require(dimension < DIMENSION_COUNT, "ReputationEngine: invalid dimension");
        return scores[agent].dimensions[dimension];
    }

    function getRatingHistory(address agent) external view returns (RatingEvent[] memory) {
        return ratingHistory[agent];
    }

    function getRank(address[] calldata agents) external view returns (address[] memory ranked) {
        ranked = agents;
        // Simple insertion sort (small arrays in practice)
        for (uint256 i = 1; i < ranked.length; i++) {
            address key = ranked[i];
            uint256 keyScore = scores[key].composite;
            int256 j = int256(i) - 1;
            while (j >= 0 && scores[ranked[uint256(j)]].composite < keyScore) {
                ranked[uint256(j + 1)] = ranked[uint256(j)];
                j--;
            }
            ranked[uint256(j + 1)] = key;
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function updateWeights(uint256[8] calldata weights) external {
        require(msg.sender == owner, "ReputationEngine: not owner");
        uint256 total = 0;
        for (uint8 i = 0; i < DIMENSION_COUNT; i++) total += weights[i];
        require(total == 1000, "ReputationEngine: weights must sum to 1000");
        for (uint8 i = 0; i < DIMENSION_COUNT; i++) dimensionWeights[i] = weights[i];
    }
}
