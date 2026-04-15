// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/ReputationEngine.sol";
import "../src/SkillMarket.sol";
import "../src/SiloToken.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        AgentRegistry    registry   = new AgentRegistry();
        ReputationEngine rep        = new ReputationEngine(address(registry));
        SkillMarket      skillMarket = new SkillMarket();
        SiloToken        silo       = new SiloToken();

        // Wire SiloToken to ReputationEngine so on-chain scores are authoritative
        silo.setReputationEngine(address(rep));

        vm.stopBroadcast();

        console.log("AgentRegistry:   ", address(registry));
        console.log("ReputationEngine:", address(rep));
        console.log("SkillMarket:     ", address(skillMarket));
        console.log("SiloToken:       ", address(silo));
    }
}
