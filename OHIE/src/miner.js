"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mine_new_block = exports.generatenextBlockWithTransaction = exports.generateNextBlock = exports.generateRawNextBlock = void 0;
const CryptoJS = require("crypto-js");
const transaction_1 = require("./transaction");
const blockchain_1 = require("./blockchain");
const wallet_1 = require("./wallet");
const p2p_1 = require("./p2p");
const transactionPool_1 = require("./transactionPool");
const verify_1 = require("./verify");
const Configuration_1 = require("./Configuration");
const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);
let ser;
const generateRawNextBlock = (blockData, chainID = 0) => {
    const previousBlock = blockchain_1.getLatestBlock(chainID);
    const difficulty = blockchain_1.getDifficulty(chainID, blockchain_1.getBlockchain());
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = getCurrentTimestamp();
    const newBlock = blockchain_1.findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if (blockchain_1.addBlockToChain(newBlock, chainID)) {
        p2p_1.broadcastLatest();
        return newBlock;
    }
    else {
        return null;
    }
};
exports.generateRawNextBlock = generateRawNextBlock;
const FOLDER_BLOCKS = "";
const my_ip = "";
const my_port = "";
const generateNextBlock = (chainID = 0) => {
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), blockchain_1.getLatestBlock(chainID).index + 1);
    const blockData = [coinbaseTx].concat(transactionPool_1.getTransactionPool());
    return generateRawNextBlock(blockData, chainID);
};
exports.generateNextBlock = generateNextBlock;
const generatenextBlockWithTransaction = (receiverAddress, amount) => {
    if (!transaction_1.isValidAddress(receiverAddress)) {
        throw Error('invalid address');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    let chainID = 0;
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), blockchain_1.getLatestBlock(chainID).index + 1);
    const tx = wallet_1.createTransaction(receiverAddress, amount, wallet_1.getPrivateFromWallet(), blockchain_1.getUnspentTxOuts(), transactionPool_1.getTransactionPool());
    const blockData = [coinbaseTx, tx];
    return generateRawNextBlock(blockData, chainID);
};
exports.generatenextBlockWithTransaction = generatenextBlockWithTransaction;
//-----------------------------------------------
// Below are the functions that move from miner.cpp
let total_mined = 0;
function mine_new_block(bc) {
    //std::unique_lock<std::mutex> l(bc->lock);
    //bc->can_write.wait( l, [bc](){return !bc->locker_write;});
    //bc->locker_write = true;
    // Concatenate the candidates of all chains 
    let leaves = []; // used in Merkle tree hash computation
    // Last block of the trailing chain 
    let trailing_block = blockchain_1.get_deepest_child_by_chain_id(0);
    let trailing_id = 0;
    for (let i = 0; i < Configuration_1.default.MAX_CHAINS; i++) {
        let b = blockchain_1.get_deepest_child_by_chain_id(i);
        if (null == b) {
            console.log("Something is wrong in mine_new_block: get_deepest return NULL");
            return;
        }
        if (null == b.nb) {
            console.log("Something is wrong in mine_new_block: get_deepest return block with NULL nb pointer");
            return;
        }
        if (b.nextRank > trailing_block.nextRank) {
            trailing_block = b;
            trailing_id = i;
        }
        leaves.push(verify_1.blockhash_to_string(b.hash));
    }
    // Make a complete binary tree
    let tot_size_add = Math.pow(2, Math.ceil(Math.log(leaves.length) / Math.log(2))) - leaves.length;
    for (let i = 0; i < tot_size_add; i++)
        leaves.push(Configuration_1.default.EMPTY_LEAF);
    // hash to produce the hash of the new block
    let merkle_root_chains = verify_1.compute_merkle_tree_root(leaves);
    //let merkle_root_txs: string = toString(rng());
    let merkle_root_txs = Math.random().toString();
    let h = CryptoJS.SHA256(merkle_root_chains + merkle_root_txs).toString();
    // Determine the chain where it should go
    let chain_id = verify_1.get_chain_id_from_hash(h);
    // Determine the new block
    let new_block = verify_1.string_to_blockhash(h);
    // Create file holding the whole block
    // Supposedly composed of transactions
    let no_txs = transaction_1.create_transaction_block(new_block, FOLDER_BLOCKS + "/" + my_ip + "-" + my_port + "/" + verify_1.blockhash_to_string(new_block));
    if (0 == no_txs) {
        console.log("Cannot create the file with transaction");
        return;
    }
    // Find Merkle path for the winning chain
    let proof_new_chain = verify_1.compute_merkle_proof(leaves, chain_id);
    // Last block of the chain where new block will be mined
    let parent = blockchain_1.get_deepest_child_by_chain_id(chain_id);
    let nb;
    nb.chain_id = chain_id;
    nb.parent = parent.hash;
    nb.hash = new_block;
    nb.trailing = trailing_block.hash;
    nb.trailing_id = trailing_id;
    nb.merkle_root_chains = merkle_root_chains;
    nb.merkle_root_txs = merkle_root_txs;
    nb.proof_new_chain = proof_new_chain;
    nb.no_txs = no_txs;
    nb.rank = parent.nextRank;
    nb.next_rank = trailing_block.nextRank;
    if (nb.next_rank <= nb.rank)
        nb.next_rank = nb.rank + 1;
    nb.depth = parent.nb.depth + 1;
    let time_of_now;
    let currentdate = new Date();
    time_of_now = Math.round(currentdate.getTime() / 1000) / currentdate.getMilliseconds();
    //let time_of_now: number = std::chrono::system_clock::now().time_since_epoch() / std::chrono::milliseconds(1);
    nb.time_mined = time_of_now;
    nb.time_received = time_of_now;
    for (let j = 0; j < Configuration_1.default.NO_T_DISCARDS; j++) {
        nb.time_commited[j] = 0;
        nb.time_partial[j] = 0;
    }
    // Add the block to the chain
    blockchain_1.add_block_by_parent_hash_and_chain_id(parent.hash, new_block, chain_id, nb);
    if (Configuration_1.default.PRINT_MINING_MESSAGES) {
        //printf("\033[33;1m[+] Mined block on chain[%d] : [%lx %lx]\n\033[0m", chain_id, parent->hash, new_block);
        console.log("033[33;1m[+] Mined block on chain[%d] : [%lx %lx]\n033[0m", chain_id, parent.hash, new_block);
    }
    // Set block flag as full block
    let bz = blockchain_1.find_block_by_hash_and_chain_id(new_block, chain_id);
    if (null != bz && null != bz.nb) {
        bz.is_full_block = true;
    }
    // Increase the miner counter
    blockchain_1.add_mined_block();
    // Send the block to peers
    p2p_1.send_block_to_peers(nb);
    //bc->locker_write = false;
    //l.unlock();
    //bc->can_write.notify_one();
    return chain_id;
}
exports.mine_new_block = mine_new_block;
/*
function get_mine_time_in_milliseconds() : Int64
{
    std::exponential_distribution<double> exp_dist (1.0/EXPECTED_MINE_TIME_IN_MILLISECONDS);
    uint32_t msec = exp_dist(rng);

    if(PRINT_MINING_MESSAGES) {
        printf("\033[33;1m[ ] Will mine new block in  %.3f  seconds \n\033[0m", (float)msec/1000 );
        fflush(stdout);
    }
    
    return msec;
}
*/
function setServer(_ser) {
    this.ser = _ser;
}
function miner(bc) {
    /*
    if (! CAN_INTERRUPT)
        boost::this_thread::sleep(boost::posix_time::milliseconds(get_mine_time_in_milliseconds() ));
    else{

        try{
            boost::this_thread::sleep(boost::posix_time::milliseconds(get_mine_time_in_milliseconds() ));
        }
        catch (boost::thread_interrupted &){

            if( PRINT_INTERRUPT_MESSAGES){
                printf("\033[35;1mInterrupt mining, recieved new block from a peer \n\033[0m");
                fflush(stdout);
            }

            miner( bc );
        }
    }
    */
    miner(bc);
    if (total_mined >= Configuration_1.default.MAX_MINE_BLOCKS)
        return;
    total_mined++;
    // Incorporate new block into the blockchain and pass it to peers
    if (null != this.ser)
        mine_new_block(bc);
    // Mine next block
    miner(bc);
    return;
}
//# sourceMappingURL=miner.js.map