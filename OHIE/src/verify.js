"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_chain_id_from_hash = exports.compute_merkle_proof = exports.compute_merkle_tree_root = exports.blockhash_to_string = void 0;
const CryptoJS = require("crypto-js");
const Configuration_1 = require("./Configuration");
function blockhash_to_string(b) {
    let hash = b.toString(16);
    //if ( hash.length < 2 * sizeOf(BlockHash) )
    //	hash = string(2 * sizeOf(BlockHash) - hash.length, '0').append( hash );
    let newhash = padLeft(hash, '0', 2 * 8);
    return newhash;
}
exports.blockhash_to_string = blockhash_to_string;
function padLeft(text, padChar, size) {
    return (String(padChar).repeat(size) + text).substr((size * -1), size);
}
function compute_merkle_tree_root(leaves) {
    let tmp = leaves;
    let next = 0;
    while (tmp.length > 1) {
        let tmp2 = tmp;
        tmp = [];
        for (let i = 0; i < tmp2.length / 2; i++) {
            let st = tmp2[2 * i + 0] + tmp2[2 * i + 1];
            next += 2;
            tmp.push(CryptoJS.SHA256(st).toString());
        }
    }
    return tmp[0];
}
exports.compute_merkle_tree_root = compute_merkle_tree_root;
function compute_merkle_proof(leaves, index) {
    let first_index = index;
    let proof;
    proof.push(leaves[index]);
    let tmp = leaves;
    while (tmp.length > 1) {
        let tmp2 = tmp;
        tmp = [];
        let adj_index = (index % 2) ? (index - 1) : (index + 1);
        for (let i = 0; i < tmp2.length / 2; i++) {
            let st = tmp2[2 * i + 0] + tmp2[2 * i + 1];
            tmp.push(CryptoJS.SHA256(st).toString());
            if (2 * i + 0 == adj_index || 2 * i + 1 == adj_index)
                proof.push((2 * i + 0 == adj_index) ? tmp2[2 * i + 0] : tmp2[2 * i + 1]);
        }
        index /= 2;
    }
    proof.push(tmp[0]);
    return proof;
}
exports.compute_merkle_proof = compute_merkle_proof;
function get_chain_id_from_hash(h) {
    //return stoi ( h.substr(58) ,nullptr,16) % CHAINS;
    return parseInt(h.substring(58), 16) % Configuration_1.default.CHAINS;
}
exports.get_chain_id_from_hash = get_chain_id_from_hash;
//# sourceMappingURL=verify.js.map