import {
    add_received_block, NetworkBlock, get_deepest_child_by_chain_id, find_block_by_hash_and_chain_id, find_incomplete_block_by_hash_and_chain_id
} from './blockchain';

enum MessageType {
    QUERY_LATEST = 0,
    QUERY_ALL = 1,
    RESPONSE_BLOCKCHAIN = 2,
    QUERY_TRANSACTION_POOL = 3,
    RESPONSE_TRANSACTION_POOL = 4,
    ASK_BLOCK = 5,
    PROCESS_BLOCK = 6,
    GOT_FULL_BLOCK = 7,
    HAVE_FULL_BLOCK = 8,
    ask_full_block = 9,
    full_block = 10
}

class Message {
    public type: MessageType;
    public data: any;
}

export const create__ask_block = (chain_id, hash, my_depth, hash_depth): Message => ({

	'type': MessageType.ASK_BLOCK, 'data': JSON.stringify({
		'chain_id': chain_id,
		'hash': hash,
		'hash_depth': ( my_depth >= hash_depth)? 1:(hash_depth - my_depth) ,

	})
})

export const create__process_block = (nb: NetworkBlock): Message => ({'type': MessageType.ASK_BLOCK, 'data': JSON.stringify(nb)});
