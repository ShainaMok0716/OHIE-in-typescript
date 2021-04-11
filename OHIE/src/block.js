"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incompleteBlock = exports.Block = exports.networkBlock = void 0;
class networkBlock {
    constructor() {
    }
}
exports.networkBlock = networkBlock;
class Block {
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID, rank, nextRank) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
        this.rank = rank;
        this.nextRank = nextRank;
        this.chainID = chainID;
    }
}
exports.Block = Block;
class incompleteBlock {
    constructor() {
    }
}
exports.incompleteBlock = incompleteBlock;
//# sourceMappingURL=block.js.map