import {
    getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut
} from './transaction';
import {
    Block, getBlockchain, getUnspentTxOuts, getLatestBlock, getDifficulty, findBlock, addBlockToChain
} from './blockchain';
import { createTransaction, findUnspentTxOuts, getBalance, getPrivateFromWallet, getPublicFromWallet } from './wallet';
import { broadcastLatest, broadCastTransactionPool } from './p2p';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';

const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

const generateRawNextBlock = (blockData: Transaction[], chainID = 0) => {
    const previousBlock: Block = getLatestBlock(chainID);
    const difficulty: number = getDifficulty(chainID,getBlockchain());
    const nextIndex: number = previousBlock.index + 1;
    const nextTimestamp: number = getCurrentTimestamp();
    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if (addBlockToChain(newBlock, chainID)) {
        broadcastLatest();
        return newBlock;
    } else {
        return null;
    }
};

const generateNextBlock = (chainID = 0) => {
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock(chainID).index + 1);
    const blockData: Transaction[] = [coinbaseTx].concat(getTransactionPool());
    return generateRawNextBlock(blockData, chainID);
};

const generatenextBlockWithTransaction = (receiverAddress: string, amount: number) => {
    if (!isValidAddress(receiverAddress)) {
        throw Error('invalid address');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }

    let chainID = 0;

    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock(chainID).index + 1);
    const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    const blockData: Transaction[] = [coinbaseTx, tx];
    return generateRawNextBlock(blockData, chainID);
};

export {
    generateRawNextBlock, generateNextBlock, generatenextBlockWithTransaction,
};
