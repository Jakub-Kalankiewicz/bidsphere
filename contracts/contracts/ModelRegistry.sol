// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ModelRegistry {
    address public owner;

    // --- Individual registration (unchanged) ---
    struct ModelRecord {
        bytes32 hash;
        uint256 timestamp;
        bool registered;
    }
    mapping(string => ModelRecord) private models;

    // --- Merkle batch registration ---
    struct MerkleRecord {
        bytes32 root;
        uint256 timestamp;
        string[] modelIds;
    }
    mapping(uint256 => MerkleRecord) private merkleBatches;
    mapping(string => uint256) private modelToBatchId;
    uint256 public batchCount;

    event ModelRegistered(string indexed modelId, bytes32 hash, uint256 timestamp);
    event MerkleRootRegistered(uint256 indexed batchId, bytes32 root, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    // --- Individual registration (unchanged) ---
    function registerModel(string calldata modelId, bytes32 hash) external onlyOwner {
        models[modelId] = ModelRecord({ hash: hash, timestamp: block.timestamp, registered: true });
        emit ModelRegistered(modelId, hash, block.timestamp);
    }

    function getModel(string calldata modelId) external view returns (bytes32 hash, uint256 timestamp) {
        require(models[modelId].registered, "Model not registered");
        return (models[modelId].hash, models[modelId].timestamp);
    }

    function isRegistered(string calldata modelId) external view returns (bool) {
        return models[modelId].registered;
    }

    // --- Merkle batch registration ---
    function registerMerkleRoot(bytes32 root, string[] calldata modelIds) external onlyOwner {
        uint256 batchId = ++batchCount;
        merkleBatches[batchId] = MerkleRecord({ root: root, timestamp: block.timestamp, modelIds: modelIds });
        for (uint256 i = 0; i < modelIds.length; i++) {
            modelToBatchId[modelIds[i]] = batchId;
        }
        emit MerkleRootRegistered(batchId, root, block.timestamp);
    }

    function getMerkleRoot(uint256 batchId) external view returns (bytes32 root, uint256 timestamp, string[] memory modelIds) {
        require(batchId > 0 && batchId <= batchCount, "Batch not found");
        MerkleRecord storage rec = merkleBatches[batchId];
        return (rec.root, rec.timestamp, rec.modelIds);
    }

    function getBatchForModel(string calldata modelId) external view returns (uint256 batchId) {
        return modelToBatchId[modelId];
    }
}
