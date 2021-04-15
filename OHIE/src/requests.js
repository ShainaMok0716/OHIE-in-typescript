"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create__full_block = exports.create__ask_full_block = exports.create__have_full_block = exports.create__got_full_block = exports.create__process_block = exports.create__ask_block = exports.Message = void 0;
const p2p_1 = require("./p2p");
class Message {
}
exports.Message = Message;
exports.create__ask_block = (chain_id, hash, my_depth, hash_depth) => ({
    'type': p2p_1.MessageType.ask_block, 'data': JSON.stringify({
        'chain_id': chain_id,
        'hash': hash,
        'hash_depth': (my_depth >= hash_depth) ? 1 : (hash_depth - my_depth),
    })
});
exports.create__process_block = (nb) => ({
    'type': p2p_1.MessageType.process_block,
    'data': JSON.stringify(nb)
});
exports.create__got_full_block = (chain_id, hash) => ({
    'type': p2p_1.MessageType.got_full_block,
    'data': JSON.stringify({
        'chain_id': chain_id,
        'hash': hash
    })
});
exports.create__have_full_block = (chain_id, hash) => ({
    'type': p2p_1.MessageType.have_full_block,
    'data': JSON.stringify({
        'chain_id': chain_id,
        'hash': hash
    })
});
exports.create__ask_full_block = (chain_id, hash) => ({
    'type': p2p_1.MessageType.ask_full_block,
    'data': JSON.stringify({
        'chain_id': chain_id,
        'hash': hash
    })
});
exports.create__full_block = (chain_id, hash, txs, nb, time_of_now) => ({
    'type': p2p_1.MessageType.ask_full_block,
    'data': JSON.stringify({
        'chain_id': chain_id,
        'hash': hash,
        'txs': txs,
        'nb': nb,
        'time_of_now': time_of_now
    })
});
//# sourceMappingURL=requests.js.map