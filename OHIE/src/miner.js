"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatenextBlockWithTransaction = exports.generateNextBlock = exports.generateRawNextBlock = void 0;
const transaction_1 = require("./transaction");
const blockchain_1 = require("./blockchain");
const wallet_1 = require("./wallet");
const p2p_1 = require("./p2p");
const transactionPool_1 = require("./transactionPool");
const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);
const generateRawNextBlock = (blockData) => {
    const previousBlock = blockchain_1.getLatestBlock();
    const difficulty = blockchain_1.getDifficulty(blockchain_1.getBlockchain());
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = getCurrentTimestamp();
    const newBlock = blockchain_1.findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if (blockchain_1.addBlockToChain(newBlock)) {
        p2p_1.broadcastLatest();
        return newBlock;
    }
    else {
        return null;
    }
};
exports.generateRawNextBlock = generateRawNextBlock;
const generateNextBlock = () => {
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), blockchain_1.getLatestBlock().index + 1);
    const blockData = [coinbaseTx].concat(transactionPool_1.getTransactionPool());
    return generateRawNextBlock(blockData);
};
exports.generateNextBlock = generateNextBlock;
const generatenextBlockWithTransaction = (receiverAddress, amount) => {
    if (!transaction_1.isValidAddress(receiverAddress)) {
        throw Error('invalid address');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), blockchain_1.getLatestBlock().index + 1);
    const tx = wallet_1.createTransaction(receiverAddress, amount, wallet_1.getPrivateFromWallet(), blockchain_1.getUnspentTxOuts(), transactionPool_1.getTransactionPool());
    const blockData = [coinbaseTx, tx];
    return generateRawNextBlock(blockData);
};
exports.generatenextBlockWithTransaction = generatenextBlockWithTransaction;
//# sourceMappingURL=miner.js.map