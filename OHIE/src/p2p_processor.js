"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handle_process_block = exports.handle_ask_block = exports.process_buffer = void 0;
const CryptoJS = require("crypto-js");
const blockchain_1 = require("./blockchain");
const transaction_1 = require("./transaction");
const p2p_1 = require("./p2p");
const requests_1 = require("./requests");
const Configuration_1 = require("./Configuration");
const verify_1 = require("./verify");
function process_buffer(ws, message) {
    console.log("process_buffer", message);
    switch (message.type) {
        case p2p_1.MessageType.ask_block:
            handle_ask_block(ws, message.data);
            break;
        case p2p_1.MessageType.process_block:
            handle_process_block(ws, message.data);
            break;
        case p2p_1.MessageType.got_full_block:
            handle_got_full_block(ws, message.data);
            break;
        case p2p_1.MessageType.have_full_block:
            handle_have_full_block(ws, message.data);
            break;
        case p2p_1.MessageType.ask_full_block:
            handle_ask_full_block(ws, message.data);
            break;
        case p2p_1.MessageType.full_block:
            handle_full_block(ws, message.data);
            break;
    }
}
exports.process_buffer = process_buffer;
function handle_ask_block(ws, data) {
    data = p2p_1.JSONToObject(data);
    // First check if it is in the main chain
    let b = blockchain_1.find_block_by_hash_and_chain_id(data.hash, data.chain_id);
    // If not, check in the incomplete chains
    if (b == null)
        b = blockchain_1.find_incomplete_block_by_hash_and_chain_id(data.hash, data.chain_id);
    // send several (max_number_of_blocks) blocks at once
    for (let i = 0; i < data.hash_depth; i++) {
        if (b != null && b.parent != null) {
            p2p_1.send_block_to_one_peer(ws, b);
            b = b.parent;
        }
    }
}
exports.handle_ask_block = handle_ask_block;
function handle_process_block(ws, data) {
    let nb = p2p_1.JSONToObject(data);
    console.log("handle_process_block", nb);
    // Add the block to the blockchain
    let added, need_parent = blockchain_1.add_received_block(nb.chain_id, nb.parent, nb.hash, nb);
    if (added) {
        p2p_1.send_block_to_peers(nb);
    }
    // If needed parent then ask peers
    let chain_depth = blockchain_1.get_deepest_child_by_chain_id(nb.chain_id).nb.depth;
    // Ask parent block from peers
    if (need_parent) {
        p2p_1.write_to_all_peers(requests_1.create__ask_block(nb.chain_id, nb.parent, chain_depth, nb.depth));
    }
}
exports.handle_process_block = handle_process_block;
;
function handle_got_full_block(ws, data) {
    // Check if this node has the full block, and if so send to the asking peer
    if (blockchain_1.have_full_block(data.chain_id, data.hash)) {
        p2p_1.write_to_one_peer(ws, requests_1.create__have_full_block(data.chain_id, data.hash));
    }
}
function handle_have_full_block(ws, data) {
    // Make sure you still DON't have the full block
    if (blockchain_1.have_full_block(data.chain_id, data.hash) == false)
        return;
    // Check that the reply from the peer node was the FIRST such reply for the asking block, and if so ask the peer node for the full block
    let time_of_now = Date.now();
    if (blockchain_1.still_waiting_for_full_block(data.hash, time_of_now)) {
        p2p_1.write_to_one_peer(ws, requests_1.create__ask_full_block(data.chain_id, data.hash));
    }
}
function handle_ask_full_block(ws, data) {
    // Make sure you have the block 
    if (blockchain_1.have_full_block(data.chain_id, data.hash))
        return;
    // Get the full block (data) and send it to the asking peer
    let b = blockchain_1.find_block_by_hash_and_chain_id(data.chain_id, data.hash);
    // TODO generate tx
    let tx, total_tx;
    if (b != null && b.nb.no_txs > 0) {
        for (let j = 0; j < b.nb.no_txs; j++) {
            tx = transaction_1.create_one_transaction();
            total_tx += tx + "\n";
        }
    }
    let nb = b.nb;
    let proof_new_chain;
    if (nb != null) {
        for (let i = 0; i < nb.proof_new_chain.length; i++) {
            proof_new_chain += nb.proof_new_chain[i];
        }
        p2p_1.write_to_one_peer(ws, requests_1.create__full_block(data.chain_id, data.hash, total_tx, nb, Date.now()));
    }
}
function handle_full_block(ws, data) {
    // Make sure the block does not exist
    if (!blockchain_1.have_full_block(data.chain_id, data.hash)) {
        return;
    }
    if (data.txs.length() >= 0) {
        let b = blockchain_1.find_block_by_hash_and_chain_id(data.hash, data.chain_id);
        if (b == null || b.nb == null) {
            console.log("Cannot find block with such hash and chain_id" + data.hash + " " + data.chain_id);
            return;
        }
        let prevpos = 0;
        let pos = 0;
        let tot_transactions = 0;
        let all_good = true;
        while (all_good && ((pos = getPosition(data.txs, "\n", pos + 1)) >= 0)) {
            let l = data.txs.subString(prevpos, pos - prevpos);
            if (Configuration_1.default.fake_transactions || transaction_1.verify_transaction(l)) {
                tot_transactions++;
            }
            else
                all_good = false;
            prevpos = pos + 1;
        }
        if (tot_transactions != b.nb.no_txs) {
            if (tot_transactions * 1.08 >= b.nb.no_txs) {
                console.log("The number of TXS differ from the one provided earlier:" + tot_transactions + " " + b.nb.no_txs);
                console.log(ws);
            }
            if (tot_transactions > 0)
                return;
        }
        if (all_good) {
            // Assing all from nb
            let n = p2p_1.JSONToObject(data.nb);
            for (let j = 0; j < Configuration_1.default.NO_T_DISCARDS; j++) {
                n.time_commited[j] = 0;
                n.time_partial[j] = 0;
            }
            let h = CryptoJS.SHA256(n.merkle_root_chains + n.merkle_root_txs).toString();
            let chain_id_from_hash = verify_1.get_chain_id_from_hash(h);
            // Verify the chain ID is correct 
            if (chain_id_from_hash != n.chain_id) {
                console.log("033[31;1mChain_id incorrect for the new block 033[0m\n");
            }
            // Verify blockhash is correct
            if (verify_1.string_to_blockhash(h) != n.hash) {
                console.log("033[31;1mBlockhash is incorrect 033[0m\n");
            }
            // Verify the new block chain Merkle proof
            if (!verify_1.verify_merkle_proof(n.proof_new_chain, n.parent, n.merkle_root_chains, chain_id_from_hash)) {
                console.log("033[31;1mFailed to verify new block chain Merkle proof 033[0m\n");
            }
            // Verify trailing 
            // If it cannot find the trailing block then ask for it
            if (null == blockchain_1.find_block_by_hash_and_chain_id(n.trailing, n.trailing_id)) {
                let s_trailing = requests_1.create__ask_block(n.trailing_id, n.trailing, 0, 0);
                p2p_1.write_to_all_peers(s_trailing);
            }
            // Increase amount of received bytes (and include message bytes )
            p2p_1.add_bytes_received(0, data.txs.size());
            console.log("033[32;1mAll %4d txs are verified \n 033[0m", tot_transactions);
            if (Configuration_1.default.WRITE_BLOCKS_TO_HDD) {
                //TODO
            }
            // Remove from hash table
            let time_of_now = Date.now();
            let required_time_to_send = "" + ((time_of_now > data.time_of_now) ? (time_of_now - data.time_of_now) : 0);
            blockchain_1.set_block_full(data.chain_id, data.hash, ws.url + " " + required_time_to_send);
            p2p_1.additional_verified_transaction(tot_transactions);
        }
    }
}
function getPosition(string, subString, index) {
    return string.split(subString, index).join(subString).length;
}
//# sourceMappingURL=p2p_processor.js.map