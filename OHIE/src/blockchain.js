"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBlock = exports.getDifficulty = exports.addBlockToChain = exports.replaceChain = exports.isValidBlockStructure = exports.getAccountBalance = exports.getMyUnspentTransactionOutputs = exports.handleReceivedTransaction = exports.sendTransaction = exports.getLatestBlock = exports.getUnspentTxOuts = exports.getBlockchain = exports.Block = void 0;
const CryptoJS = require("crypto-js");
const _ = require("lodash");
const p2p_1 = require("./p2p");
const transaction_1 = require("./transaction");
const transactionPool_1 = require("./transactionPool");
const util_1 = require("./util");
const wallet_1 = require("./wallet");
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
//initial setting
const genesisTransaction = {
    'txIns': [{ 'signature': '', 'txOutId': '', 'txOutIndex': 0 }],
    'txOuts': [{
            'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
            'amount': 50
        }],
    'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
};
const genesisBlock = new Block(0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', '', 1465154705, [genesisTransaction], 0, 0, 0, 0, 0);
// 4 chains
let blockchains = [[genesisBlock], [genesisBlock], [genesisBlock], [genesisBlock]];
// the unspent txOut of genesis block is set to unspentTxOuts on startup
let unspentTxOuts = transaction_1.processTransactions(blockchains[0][0].data, [], 0);
const getBlockchain = (chainID = 0) => blockchains[chainID];
exports.getBlockchain = getBlockchain;
const getUnspentTxOuts = () => _.cloneDeep(unspentTxOuts);
exports.getUnspentTxOuts = getUnspentTxOuts;
// and txPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut) => {
    console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
    unspentTxOuts = newUnspentTxOut;
};
const getLatestBlock = (chainID = 0) => blockchains[chainID][blockchains[chainID].length - 1];
exports.getLatestBlock = getLatestBlock;
// in seconds
const BLOCK_GENERATION_INTERVAL = 10;
// in blocks
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;
const getDifficulty = (chainID, aBlockchain) => {
    const latestBlock = aBlockchain[blockchains[chainID].length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(chainID, latestBlock, aBlockchain);
    }
    else {
        return latestBlock.difficulty;
    }
};
exports.getDifficulty = getDifficulty;
const getAdjustedDifficulty = (chainID, latestBlock, aBlockchain) => {
    const prevAdjustmentBlock = aBlockchain[blockchains[chainID].length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
    if (timeTaken < timeExpected / 2) {
        return prevAdjustmentBlock.difficulty + 1;
    }
    else if (timeTaken > timeExpected * 2) {
        return prevAdjustmentBlock.difficulty - 1;
    }
    else {
        return prevAdjustmentBlock.difficulty;
    }
};
const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);
// gets the unspent transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
    return wallet_1.findUnspentTxOuts(wallet_1.getPublicFromWallet(), getUnspentTxOuts());
};
exports.getMyUnspentTransactionOutputs = getMyUnspentTransactionOutputs;
const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    let nonce = 0;
    let chainID = 0;
    let rank = 0;
    let nextRank = 0;
    while (true) {
        const hash = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID, rank, nextRank);
        }
        nonce++;
    }
};
exports.findBlock = findBlock;
const getAccountBalance = () => {
    return wallet_1.getBalance(wallet_1.getPublicFromWallet(), getUnspentTxOuts());
};
exports.getAccountBalance = getAccountBalance;
const sendTransaction = (address, amount) => {
    const tx = wallet_1.createTransaction(address, amount, wallet_1.getPrivateFromWallet(), getUnspentTxOuts(), transactionPool_1.getTransactionPool());
    transactionPool_1.addToTransactionPool(tx, getUnspentTxOuts());
    p2p_1.broadCastTransactionPool();
    return tx;
};
exports.sendTransaction = sendTransaction;
const calculateHashForBlock = (block) => calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);
const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();
const isValidBlockStructure = (block) => {
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'object';
};
exports.isValidBlockStructure = isValidBlockStructure;
const isValidNewBlock = (newBlock, previousBlock) => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid block structure: %s', JSON.stringify(newBlock));
        return false;
    }
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }
    else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    }
    else if (!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    }
    else if (!hasValidHash(newBlock)) {
        return false;
    }
    return true;
};
const getAccumulatedDifficulty = (aBlockchain) => {
    return aBlockchain
        .map((block) => block.difficulty)
        .map((difficulty) => Math.pow(2, difficulty))
        .reduce((a, b) => a + b);
};
const isValidTimestamp = (newBlock, previousBlock) => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp)
        && newBlock.timestamp - 60 < getCurrentTimestamp();
};
const hasValidHash = (block) => {
    if (!hashMatchesBlockContent(block)) {
        console.log('invalid hash, got:' + block.hash);
        return false;
    }
    if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
    }
    return true;
};
const hashMatchesBlockContent = (block) => {
    const blockHash = calculateHashForBlock(block);
    return blockHash === block.hash;
};
const hashMatchesDifficulty = (hash, difficulty) => {
    const hashInBinary = util_1.hexToBinary(hash);
    const requiredPrefix = '0'.repeat(difficulty);
    return hashInBinary.startsWith(requiredPrefix);
};
/*
    Checks if the given blockchain is valid. Return the unspent txOuts if the chain is valid
 */
const isValidChain = (blockchainToValidate) => {
    console.log('isValidChain:');
    console.log(JSON.stringify(blockchainToValidate));
    const isValidGenesis = (block) => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };
    if (!isValidGenesis(blockchainToValidate[0])) {
        return null;
    }
    /*
    Validate each block in the chain. The block is valid if the block structure is valid
      and the transaction are valid
     */
    let aUnspentTxOuts = [];
    for (let i = 0; i < blockchainToValidate.length; i++) {
        const currentBlock = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }
        aUnspentTxOuts = transaction_1.processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === null) {
            console.log('invalid transactions in blockchain');
            return null;
        }
    }
    return aUnspentTxOuts;
};
const addBlockToChain = (newBlock, chainID = 0) => {
    if (isValidNewBlock(newBlock, getLatestBlock(chainID))) {
        const retVal = transaction_1.processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (retVal === null) {
            console.log('block is not valid in terms of transactions');
            return false;
        }
        else {
            blockchains[chainID].push(newBlock);
            setUnspentTxOuts(retVal);
            transactionPool_1.updateTransactionPool(unspentTxOuts);
            return true;
        }
    }
    return false;
};
exports.addBlockToChain = addBlockToChain;
const replaceChain = (newBlocks, chainID = 0) => {
    const aUnspentTxOuts = isValidChain(newBlocks);
    const validChain = aUnspentTxOuts !== null;
    if (validChain &&
        getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain(chainID))) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchains[chainID] = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        transactionPool_1.updateTransactionPool(unspentTxOuts);
        p2p_1.broadcastLatest();
    }
    else {
        console.log('Received blockchain invalid');
    }
};
exports.replaceChain = replaceChain;
const handleReceivedTransaction = (transaction) => {
    transactionPool_1.addToTransactionPool(transaction, getUnspentTxOuts());
};
exports.handleReceivedTransaction = handleReceivedTransaction;
//# sourceMappingURL=blockchain.js.map