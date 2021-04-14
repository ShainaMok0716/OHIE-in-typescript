"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handle_ask_block = exports.ask_block_from_peers = exports.handle_process_block = void 0;
const blockchain_1 = require("./blockchain");
const p2p_1 = require("./p2p");
function handle_process_block(nb) {
    // Add the block to the blockchain
    let added, need_parent = blockchain_1.add_received_block(nb.chain_id, nb.parent, nb.hash, nb);
    if (added) {
        p2p_1.send_block_to_peers(nb);
    }
    // If needed parent then ask peers
    let chain_depth = blockchain_1.get_deepest_child_by_chain_id(nb.chain_id).nb.depth;
    // Ask parent block from peers
    if (need_parent) {
        ask_block_from_peers(nb);
    }
}
exports.handle_process_block = handle_process_block;
;
function ask_block_from_peers(nb) {
    p2p_1.broadcast(queryBlock(nb));
}
exports.ask_block_from_peers = ask_block_from_peers;
const queryBlock = (nb) => ({ 'type': MessageType.ASK_BLOCK, 'data': JSON.stringify(nb) });
function handle_ask_block(nb) {
    let b = blockchain_1.find_block_by_hash_and_chain_id(nb.hash, nb.chain_id);
    if (b == undefined)
        b = blockchain_1.find_incomplete_block_by_hash_and_chain_id(nb.hash, nb.chain_id);
    //for(let i = 0; i < )
}
exports.handle_ask_block = handle_ask_block;
//# sourceMappingURL=p2p_processor.js.map