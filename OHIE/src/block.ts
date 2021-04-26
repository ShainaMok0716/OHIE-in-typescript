import * as _ from 'lodash';
import {
	getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut
} from './transaction';
import * as Int64 from 'node-int64';

class NetworkBlock{

	public chain_id:number;
	public parent:string;
	public hash: string;
	public trailing:string;
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
		this.rank = 0;
		this.next_rank = 1;
		this.depth = 0;
	}

}

class Block{

	public hash: string;
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

	constructor(index: number, hash: string, previousHash: string,
		timestamp: number, data: Transaction[], difficulty: number, nonce: number, chainID:number) {
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