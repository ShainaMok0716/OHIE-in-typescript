import * as _ from 'lodash';
import {
	getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut
} from './transaction';
import * as Int64 from 'node-int64';

class NetworkBlock{

	public chain_id:number;
	public parent:number;
	public hash: Int64;
	public trailing: Int64;
	public trailing_id: number;
	public merkle_root_chains: string;
	public merkle_root_txs: string;
	public proof_new_chain: string[];
	public no_txs: number;
	public depth: number;
	public rank: number;
	public next_rank: number;
	public time_mined: number;
	public time_received: number;
	public time_commited: number[];
	public time_partial: number[];

	constructor() {
		this.time_commited = [];
		this.time_partial = [];
		this.proof_new_chain = [];
	}

}

class Block{

	public hash: Int64;
	public nb: NetworkBlock;
	public is_full_block: boolean;
	public left: Block;
	public right: Block;
	public parent: Block;
	public child: Block;
	public sibling: Block;

	public index: number;
	public previousHash: string;
	public timestamp: number;
	public data: Transaction[];
	public difficulty: number;
	public nonce: number;
	public chainID: number;
	public rank: number;
	public nextRank: number;

	constructor(index: number, hash: string, previousHash: string,
		timestamp: number, data: Transaction[], difficulty: number, nonce: number, chainID: number, rank: number, nextRank: number) {
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

class IncompleteBlock{
	public b: Block;
	public next: IncompleteBlock;
	public last_asked: number;
	public no_asks: number;

	constructor() {
	}
} 

export {
	NetworkBlock, Block, IncompleteBlock
}