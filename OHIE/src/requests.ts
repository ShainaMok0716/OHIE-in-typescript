import {
    add_received_block, NetworkBlock, get_deepest_child_by_chain_id, find_block_by_hash_and_chain_id, find_incomplete_block_by_hash_and_chain_id
} from './blockchain';

import {MessageType, JSONToObject} from './p2p'


export class Message {
    public type: MessageType;
    public data: any;
}

export const create__ask_block = (chain_id, hash, my_depth, hash_depth): Message => ({
	'type': MessageType.ask_block, 'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash,
		'hash_depth': ( my_depth >= hash_depth)? 1:(hash_depth - my_depth) ,

	})
});

export const create__process_block = (nb: NetworkBlock): Message => ({
	'type': MessageType.process_block, 
	'data': JSON.stringify(nb)
});

export const create__got_full_block = (chain_id, hash): Message => ({
	'type': MessageType.got_full_block, 
	'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash
	})
});

export const create__have_full_block = (chain_id, hash): Message => ({
	'type': MessageType.have_full_block, 
	'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash
	})
});

export const create__ask_full_block = (chain_id, hash): Message => ({
	'type': MessageType.ask_full_block, 
	'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash
	})
});

export const create__full_block = (chain_id, hash, txs, nb, time_of_now): Message => ({
	'type': MessageType.ask_full_block, 
	'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash,
		'txs' : txs,
		'nb' : nb,
		'time_of_now' : time_of_now
	})
});