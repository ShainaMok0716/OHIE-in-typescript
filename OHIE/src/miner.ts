import * as CryptoJS from 'crypto-js';
import * as Int64 from 'node-int64';
import { Server } from 'ws';

import {
	getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut, create_transaction_block
} from './transaction';
import {
	get_server_folder
} from './p2p';
import {
	hexToBinary
} from './util';

import {
    NetworkBlock, Block, getBlockchain, getUnspentTxOuts, getLatestBlock, getDifficulty, findBlock, addBlockToChain,
	get_deepest_child_by_chain_id, add_block_by_parent_hash_and_chain_id, find_block_by_hash_and_chain_id,add_mined_block
} from './blockchain';
import { createTransaction, findUnspentTxOuts, getBalance, getPrivateFromWallet, getPublicFromWallet } from './wallet';
import { broadcastLatest, broadCastTransactionPool, send_block_to_peers, send_havefullblock_to_peers } from './p2p';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';
import { compute_merkle_tree_root,compute_merkle_proof,get_chain_id_from_hash } from './verify';
import config from './Configuration';

const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

let ser: Server;

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

const FOLDER_BLOCKS = "";
const my_ip = "";
const my_port = "";

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


//-----------------------------------------------
// Below are the functions that move from miner.cpp
let total_mined = 0;

export function mine_new_block(bc: Block[]) : string
{
  	//std::unique_lock<std::mutex> l(bc->lock);
	//bc->can_write.wait( l, [bc](){return !bc->locker_write;});
	//bc->locker_write = true;

	// Concatenate the candidates of all chains 
	let leaves: string[] = [];		// used in Merkle tree hash computation

	// Last block of the trailing chain 
	let trailing_block: Block = get_deepest_child_by_chain_id(0);
	let trailing_id: number = 0;
	for( let i=0; i<config.MAX_CHAINS; i++){

		let b: Block = get_deepest_child_by_chain_id(i);
		if( null == b ){
			console.log("Something is wrong in mine_new_block: get_deepest return NULL");
			return;
		}
		if( null == b.nb ){
			console.log("Something is wrong in mine_new_block: get_deepest return block with NULL nb pointer");
			return;
		}
		if (b.nb.next_rank > trailing_block.nb.next_rank) {
			trailing_block = b;
			trailing_id = i;
		}

		leaves.push(b.hash);
	}

	// Make a complete binary tree
	let tot_size_add : Int64 = Math.pow(2,Math.ceil( Math.log(leaves.length) / Math.log(2) )) - leaves.length;
	for( let i=0; i<tot_size_add ; i++)
		leaves.push(config.EMPTY_LEAF);

	// hash to produce the hash of the new block
	let merkle_root_chains: string = compute_merkle_tree_root( leaves );
	//let merkle_root_txs: string = toString(rng());
	let merkle_root_txs: string = Math.random().toString();
	let h: string= CryptoJS.SHA256( merkle_root_chains + merkle_root_txs ).toString();

	// Determine the chain where it should go
	let chain_id : Int64 = get_chain_id_from_hash(h);

	// Determine the new block
	let new_block: string = h;

	// Create file holding the whole block
	// Supposedly composed of transactions
	let no_txs : Int64 = create_transaction_block( new_block , FOLDER_BLOCKS + "/" + my_ip + "-" + my_port + "/" +  new_block ); 
	if( 0 == no_txs  ) {
		console.log("Cannot create the file with transaction");
		return;
	}

	// Find Merkle path for the winning chain
	let proof_new_chain: string[] = compute_merkle_proof( leaves, chain_id );

	// Last block of the chain where new block will be mined
	let parent: Block = get_deepest_child_by_chain_id( chain_id );

	//console.log("Get parent block:", parent.hash, "| chainid:", parent.chainID);
	console.log("Get parent block:", parent.hash, "| chainid:", chain_id);
	let nb: NetworkBlock = new NetworkBlock();
	nb.chain_id = chain_id;
	nb.parent = parent.hash;
	nb.hash = new_block;
	nb.trailing = trailing_block.hash;
	nb.trailing_id = trailing_id;
	nb.merkle_root_chains = merkle_root_chains;
	nb.merkle_root_txs = merkle_root_txs;
	nb.proof_new_chain = proof_new_chain;
	nb.no_txs = no_txs;
	nb.rank = parent.nb.next_rank;
	nb.next_rank = trailing_block.nb.next_rank;
	if (nb.next_rank <= nb.rank ) 
		nb.next_rank = nb.rank + 1;

	nb.depth = parent.nb.depth + 1;
	let time_of_now: number;
	let currentdate: Date = new Date(); 
	time_of_now = Math.round(currentdate.getTime() / 1000)/currentdate.getMilliseconds();
	//let time_of_now: number = std::chrono::system_clock::now().time_since_epoch() / std::chrono::milliseconds(1);
	nb.time_mined = time_of_now;
	nb.time_received = time_of_now;
	for( let j=0; j<config.NO_T_DISCARDS; j++){
		nb.time_commited[j] = 0;
		nb.time_partial[j] = 0;
	}

	// Add the block to the chain
	add_block_by_parent_hash_and_chain_id( parent.hash, new_block, chain_id, nb );
	if( config.PRINT_MINING_MESSAGES) {
		//printf("\033[33;1m[+] Mined block on chain[%d] : [%lx %lx]\n\033[0m", chain_id, parent->hash, new_block);
		console.log("Mined block on chain", chain_id);
	}

	// Set block flag as full block
	//console.log("new_block:"+new_block);
	//console.log("chain_id:"+chain_id);
	let bz: Block = find_block_by_hash_and_chain_id(new_block, chain_id);
	if (null != bz && null != bz.nb) {
		console.log("Find new block by hash :", bz.hash, "result: success");
		bz.is_full_block = true;
	}
	else {
		console.log("Find new block by hash :", bz.hash, "result: fail");
}

	// Increase the miner counter
	add_mined_block();

	// Send the block to peers
	send_block_to_peers(nb);

	send_havefullblock_to_peers(chain_id, bz.hash);
	//bc->locker_write = false;
	//l.unlock();
	//bc->can_write.notify_one();

	return chain_id;
}

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

function setServer(_ser: Server) {
	this.ser = _ser;
}

function miner( bc: Block[])
{
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
	miner( bc );

	if( total_mined >= config.MAX_MINE_BLOCKS) 
		return;
	
	total_mined++;

	// Incorporate new block into the blockchain and pass it to peers
	if ( null != this.ser )
    	mine_new_block(bc);

  	// Mine next block
    miner( bc );
	
	return;
}