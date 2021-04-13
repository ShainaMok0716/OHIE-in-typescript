"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncompleteBlock = exports.Block = exports.NetworkBlock = void 0;
class NetworkBlock {
    constructor() {
    }
}
exports.NetworkBlock = NetworkBlock;
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
class IncompleteBlock {
    constructor() {
    }
}
exports.IncompleteBlock = IncompleteBlock;
//# sourceMappingURL=block.js.map