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

const generateRawNextBlock = (blockData: Transaction[]) => {
    const previousBlock: Block = getLatestBlock();
    const difficulty: number = getDifficulty(getBlockchain());
    const nextIndex: number = previousBlock.index + 1;
    const nextTimestamp: number = getCurrentTimestamp();
    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if (addBlockToChain(newBlock)) {
        broadcastLatest();
        return newBlock;
    } else {
        return null;
    }
};

const generateNextBlock = () => {
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const blockData: Transaction[] = [coinbaseTx].concat(getTransactionPool());
    return generateRawNextBlock(blockData);
};

const generatenextBlockWithTransaction = (receiverAddress: string, amount: number) => {
    if (!isValidAddress(receiverAddress)) {
        throw Error('invalid address');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
    const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    const blockData: Transaction[] = [coinbaseTx, tx];
    return generateRawNextBlock(blockData);
};

export {
    generateRawNextBlock, generateNextBlock, generatenextBlockWithTransaction,
};
