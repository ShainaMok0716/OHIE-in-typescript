"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncompleteBlock = exports.Block = exports.NetworkBlock = void 0;
class NetworkBlock {
    constructor() {
        this.time_commited = [];
        this.time_partial = [];
        this.proof_new_chain = [];
        this.rank = 0;
        this.next_rank = 1;
        this.depth = 0;
    }
}
exports.NetworkBlock = NetworkBlock;
class Block {
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
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