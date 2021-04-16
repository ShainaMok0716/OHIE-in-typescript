"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_chain_id_from_hash = exports.compute_merkle_proof = exports.compute_merkle_tree_root = exports.blockhash_to_string = exports.verify_merkle_proof = exports.string_to_blockhash = void 0;
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
function string_to_blockhash(h) {
    //return stoull( h.substr(0, 2*sizeof(BlockHash)), nullptr, 16);
    return parseInt(h.substring(0, 2 * 8), 16);
}
exports.string_to_blockhash = string_to_blockhash;
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
function verify_merkle_proof(proof, bh, root, index) {
    let h = blockhash_to_string(bh);
    if (proof[0] != h && proof[1] != h)
        return false;
    let i = 1;
    while (i + 1 < proof.size()) {
        if (index % 2)
            h = sha256(proof[i] + h);
        else
            h = sha256(h + proof[i]);
        i++;
        index /= 2;
    }
    if (proof[i] != h || root != h) {
        cout << "bad root" << endl;
        cout << (proof[i] == h) << endl;
        cout << (root == h) << endl;
        cout << proof[i] << endl;
        cout << h << endl;
        cout << root << endl;
        return false;
    }
    return true;
}
exports.verify_merkle_proof = verify_merkle_proof;
//# sourceMappingURL=verify.js.map