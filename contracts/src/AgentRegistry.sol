// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRegistry
 * @notice SILOPOLIS on-chain agent identity, registration, and profile storage
 * @dev Deployed on X Layer (Chain ID: 196 mainnet / 195 testnet)
 */
contract AgentRegistry {
    // ─── Types ───────────────────────────────────────────────────────────────

    struct Agent {
        address wallet;
        string  name;
        string  agentType;   // "trader" | "analyst" | "scout" | "executor" | "oracle"
        string  metadataURI; // IPFS CID for extended profile
        uint256 registeredAt;
        bool    active;
        uint256 totalTxCount;
        uint256 skillHash;   // keccak256 of current skill set (evolves over time)
    }

    struct SkillEntry {
        string  skillId;
        uint256 acquiredAt;
        uint8   proficiency; // 0–100
        address learnedFrom; // 0x0 = self-acquired
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public agentCount;
    mapping(address => Agent)       public agents;
    mapping(address => bool)        public registered;
    mapping(address => SkillEntry[]) public agentSkills;
    mapping(string  => address)     public nameToAgent;

    address[] public agentList;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed wallet, string name, string agentType, uint256 timestamp);
    event AgentUpdated(address indexed wallet, string metadataURI);
    event SkillAcquired(address indexed agent, string skillId, uint8 proficiency, address learnedFrom);
    event ActivityRecorded(address indexed agent, uint256 newTxCount);
    event AgentDeactivated(address indexed wallet);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyRegistered() {
        require(registered[msg.sender], "AgentRegistry: not registered");
        _;
    }

    modifier onlyActive() {
        require(agents[msg.sender].active, "AgentRegistry: agent inactive");
        _;
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    function register(
        string calldata name,
        string calldata agentType,
        string calldata metadataURI
    ) external {
        require(!registered[msg.sender], "AgentRegistry: already registered");
        require(nameToAgent[name] == address(0), "AgentRegistry: name taken");
        require(bytes(name).length > 0 && bytes(name).length <= 32, "AgentRegistry: invalid name length");

        agents[msg.sender] = Agent({
            wallet:       msg.sender,
            name:         name,
            agentType:    agentType,
            metadataURI:  metadataURI,
            registeredAt: block.timestamp,
            active:       true,
            totalTxCount: 0,
            skillHash:    0
        });

        registered[msg.sender] = true;
        nameToAgent[name] = msg.sender;
        agentList.push(msg.sender);
        agentCount++;

        emit AgentRegistered(msg.sender, name, agentType, block.timestamp);
    }

    function updateProfile(string calldata metadataURI) external onlyRegistered {
        agents[msg.sender].metadataURI = metadataURI;
        emit AgentUpdated(msg.sender, metadataURI);
    }

    // ─── Skills ───────────────────────────────────────────────────────────────

    function acquireSkill(
        string calldata skillId,
        uint8 proficiency,
        address learnedFrom
    ) external onlyRegistered onlyActive {
        require(proficiency <= 100, "AgentRegistry: proficiency out of range");

        agentSkills[msg.sender].push(SkillEntry({
            skillId:      skillId,
            acquiredAt:   block.timestamp,
            proficiency:  proficiency,
            learnedFrom:  learnedFrom
        }));

        // Update skill hash — commitment to the full skill set
        agents[msg.sender].skillHash = uint256(keccak256(abi.encode(
            agents[msg.sender].skillHash,
            skillId,
            proficiency,
            block.timestamp
        )));

        emit SkillAcquired(msg.sender, skillId, proficiency, learnedFrom);
    }

    function getSkills(address agent) external view returns (SkillEntry[] memory) {
        return agentSkills[agent];
    }

    function getSkillCount(address agent) external view returns (uint256) {
        return agentSkills[agent].length;
    }

    // ─── Activity ─────────────────────────────────────────────────────────────

    function recordActivity(uint256 txDelta) external onlyRegistered onlyActive {
        agents[msg.sender].totalTxCount += txDelta;
        emit ActivityRecorded(msg.sender, agents[msg.sender].totalTxCount);
    }

    function deactivate() external onlyRegistered {
        agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAgent(address wallet) external view returns (Agent memory) {
        return agents[wallet];
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }

    function getActiveAgents() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].active) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].active) active[idx++] = agentList[i];
        }
        return active;
    }
}
