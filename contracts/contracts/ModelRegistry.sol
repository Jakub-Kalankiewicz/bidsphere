// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ModelRegistry
 * @notice Stores SHA-256 hashes of 3D auction models for integrity verification.
 * Each model is identified by its MongoDB AuctionItem ID.
 */
contract ModelRegistry {
    address public owner;

    struct ModelRecord {
        bytes32 hash;
        uint256 timestamp;
        bool registered;
    }

    mapping(string => ModelRecord) private models;

    event ModelRegistered(
        string indexed modelId,
        bytes32 hash,
        uint256 timestamp
    );

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    /**
     * @notice Register a model hash on-chain. Only callable by the contract owner.
     * @param modelId  The MongoDB AuctionItem ID (24-char hex string)
     * @param hash     SHA-256 hash of the GLB file as bytes32
     */
    function registerModel(
        string calldata modelId,
        bytes32 hash
    ) external onlyOwner {
        models[modelId] = ModelRecord({
            hash: hash,
            timestamp: block.timestamp,
            registered: true
        });
        emit ModelRegistered(modelId, hash, block.timestamp);
    }

    /**
     * @notice Retrieve the registered hash and timestamp for a model.
     * @param modelId  The MongoDB AuctionItem ID
     */
    function getModel(
        string calldata modelId
    ) external view returns (bytes32 hash, uint256 timestamp) {
        require(models[modelId].registered, "Model not registered");
        return (models[modelId].hash, models[modelId].timestamp);
    }

    /**
     * @notice Check whether a model has been registered.
     * @param modelId  The MongoDB AuctionItem ID
     */
    function isRegistered(string calldata modelId) external view returns (bool) {
        return models[modelId].registered;
    }
}
