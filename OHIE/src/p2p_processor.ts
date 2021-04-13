import * as WebSocket from 'ws';
import {Server} from 'ws';
import {
    add_received_block, NetworkBlock, get_deepest_child_by_chain_id, find_block_by_hash_and_chain_id, find_incomplete_block_by_hash_and_chain_id
} from './blockchain';
import {Transaction} from './transaction';
import {getTransactionPool} from './transactionPool';
import {send_block_to_peers, broadcast} from './p2p';

export function handle_process_block(nb: NetworkBlock){

    // Add the block to the blockchain
    let added, need_parent = add_received_block(nb.chain_id, nb.parent, nb.hash, nb);
    if(added) {
        send_block_to_peers(nb);
    }

    // If needed parent then ask peers
    let chain_depth = get_deepest_child_by_chain_id(nb.chain_id).nb.depth;

    // Ask parent block from peers
    if ( need_parent ){
        ask_block_from_peers(nb,)
    }
};

export function ask_block_from_peers(nb){
    broadcast(queryBlock(nb));
}

const queryBlock = (nb: NetworkBlock): Message => ({'type': MessageType.ASK_BLOCK, 'data': JSON.stringify(nb)});

export function handle_ask_block(nb: NetworkBlock){
    let b = find_block_by_hash_and_chain_id(nb.hash, nb.chain_id);
    if(b == undefined)
        b = find_incomplete_block_by_hash_and_chain_id(nb.hash, nb.chain_id);

    for(let i = 0; i < )
}