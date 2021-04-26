"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_chain_id_from_hash = exports.compute_merkle_proof = exports.compute_merkle_tree_root = exports.verify_merkle_proof = exports.string_to_blockhash = void 0;
const CryptoJS = require("crypto-js");
const Configuration_1 = require("./Configuration");
function blockhash_to_string(b) {
    /*
    console.log("Before ---------->" + b);
    let hash: string = b.toString(16);
    console.log("After ---------->" + hash);
        
    //if ( hash.length < 2 * sizeOf(BlockHash) )
    //	hash = string(2 * sizeOf(BlockHash) - hash.length, '0').append( hash );
    let newhash:string = padLeft(hash, '0', 64);
    
    return newhash;
    */
    return "";
}
function padLeft(text, padChar, size) {
    return (String(padChar).repeat(size) + text).substr((size * -1), size);
}
function string_to_blockhash(h) {
    //return stoull( h.substr(0, 2*sizeof(BlockHash)), nullptr, 16);
    //return parseInt(h.substring(0, 4 * 8),16);
    return parseInt(h, 16);
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
    let proof = [];
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
    //let h: string = blockhash_to_string( bh );
    let h = bh;
    if (proof[0] != h && proof[1] != h)
        return false;
    let i = 1;
    while (i + 1 < proof.length) {
        if (index % 2)
            h = CryptoJS.SHA256(proof[i] + h).toString();
        else
            h = CryptoJS.SHA256(h + proof[i]).toString();
        i++;
        index /= 2;
    }
    if (proof[i] != h || root != h) {
        console.log("bad root");
        console.log(proof[i] == h);
        console.log(root == h);
        console.log(proof[i]);
        console.log(h);
        console.log(root);
        return false;
    }
    return true;
}
exports.verify_merkle_proof = verify_merkle_proof;
//# sourceMappingURL=verify.js.map