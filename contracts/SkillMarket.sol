// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SkillMarket
 * @notice On-chain marketplace where agents list, trade, and acquire skills
 * @dev Skills are JSON-schema definitions stored as IPFS CIDs.
 *      Transactions flow through OnchainOS Payment module (x402 protocol).
 */
contract SkillMarket {
    // ─── Types ────────────────────────────────────────────────────────────────

    struct Skill {
        uint256 id;
        address creator;
        string  name;
        string  category;     // "trading" | "analysis" | "routing" | "social" | "oracle"
        string  schemaURI;    // IPFS CID pointing to skill.md definition
        uint256 price;        // Price in OKB (wei), 0 = free
        uint256 purchaseCount;
        uint256 rating;       // Aggregate rating 0–1000
        uint256 ratingCount;
        bool    active;
        uint256 createdAt;
    }

    struct Purchase {
        uint256 skillId;
        address buyer;
        uint256 price;
        uint256 timestamp;
        uint8   proficiency; // Self-reported post-use proficiency
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public skillCount;
    mapping(uint256 => Skill)   public skills;
    mapping(address => uint256[]) public creatorSkills;
    mapping(address => mapping(uint256 => bool)) public owns; // agent => skillId => owned
    mapping(address => Purchase[]) public purchaseHistory;

    address public owner;
    uint256 public platformFeeBps = 250; // 2.5% platform fee

    // ─── Events ───────────────────────────────────────────────────────────────

    event SkillListed(uint256 indexed id, address indexed creator, string name, uint256 price);
    event SkillPurchased(uint256 indexed id, address indexed buyer, uint256 price);
    event SkillRated(uint256 indexed id, address indexed rater, uint8 rating);
    event SkillUpdated(uint256 indexed id, string newSchemaURI);
    event ProficiencyReported(address indexed agent, uint256 skillId, uint8 proficiency);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Listing ──────────────────────────────────────────────────────────────

    function listSkill(
        string calldata name,
        string calldata category,
        string calldata schemaURI,
        uint256 price
    ) external returns (uint256 skillId) {
        skillId = ++skillCount;

        skills[skillId] = Skill({
            id:            skillId,
            creator:       msg.sender,
            name:          name,
            category:      category,
            schemaURI:     schemaURI,
            price:         price,
            purchaseCount: 0,
            rating:        0,
            ratingCount:   0,
            active:        true,
            createdAt:     block.timestamp
        });

        creatorSkills[msg.sender].push(skillId);
        owns[msg.sender][skillId] = true; // Creator always owns their skill

        emit SkillListed(skillId, msg.sender, name, price);
    }

    // ─── Purchase ─────────────────────────────────────────────────────────────

    function purchaseSkill(uint256 skillId) external payable {
        Skill storage skill = skills[skillId];
        require(skill.active, "SkillMarket: skill not active");
        require(!owns[msg.sender][skillId], "SkillMarket: already owned");

        if (skill.price > 0) {
            require(msg.value >= skill.price, "SkillMarket: insufficient payment");

            uint256 fee = (msg.value * platformFeeBps) / 10000;
            uint256 creatorShare = msg.value - fee;

            payable(skill.creator).transfer(creatorShare);
            // Platform fee stays in contract, owner withdraws
        }

        owns[msg.sender][skillId] = true;
        skill.purchaseCount++;

        purchaseHistory[msg.sender].push(Purchase({
            skillId:     skillId,
            buyer:       msg.sender,
            price:       msg.value,
            timestamp:   block.timestamp,
            proficiency: 0
        }));

        emit SkillPurchased(skillId, msg.sender, msg.value);
    }

    // ─── Rating ───────────────────────────────────────────────────────────────

    function rateSkill(uint256 skillId, uint8 rating) external {
        require(owns[msg.sender][skillId], "SkillMarket: must own skill to rate");
        require(rating <= 100, "SkillMarket: rating out of range");

        Skill storage skill = skills[skillId];
        // Running average
        skill.rating = (skill.rating * skill.ratingCount + uint256(rating) * 10) / (skill.ratingCount + 1);
        skill.ratingCount++;

        emit SkillRated(skillId, msg.sender, rating);
    }

    function reportProficiency(uint256 skillId, uint8 proficiency) external {
        require(owns[msg.sender][skillId], "SkillMarket: must own skill");
        require(proficiency <= 100, "SkillMarket: proficiency out of range");

        Purchase[] storage history = purchaseHistory[msg.sender];
        for (uint256 i = history.length; i > 0; i--) {
            if (history[i - 1].skillId == skillId) {
                history[i - 1].proficiency = proficiency;
                break;
            }
        }

        emit ProficiencyReported(msg.sender, skillId, proficiency);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getSkill(uint256 skillId) external view returns (Skill memory) {
        return skills[skillId];
    }

    function getCreatorSkills(address creator) external view returns (uint256[] memory) {
        return creatorSkills[creator];
    }

    function getPurchases(address agent) external view returns (Purchase[] memory) {
        return purchaseHistory[agent];
    }

    function ownsSkill(address agent, uint256 skillId) external view returns (bool) {
        return owns[agent][skillId];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function updateSkillSchema(uint256 skillId, string calldata newSchemaURI) external {
        require(skills[skillId].creator == msg.sender, "SkillMarket: not creator");
        skills[skillId].schemaURI = newSchemaURI;
        emit SkillUpdated(skillId, newSchemaURI);
    }

    function setFee(uint256 feeBps) external {
        require(msg.sender == owner, "SkillMarket: not owner");
        require(feeBps <= 1000, "SkillMarket: fee too high"); // max 10%
        platformFeeBps = feeBps;
    }

    function withdraw() external {
        require(msg.sender == owner, "SkillMarket: not owner");
        payable(owner).transfer(address(this).balance);
    }
}
