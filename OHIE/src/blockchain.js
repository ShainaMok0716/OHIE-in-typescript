"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.update_blocks_commited_time = exports.add_mined_block = exports.set_block_full = exports.remove_waiting_blocks = exports.get_non_full_blocks = exports.get_incomplete_chain_hashes = exports.add_block_by_parent_hash_and_chain_id = exports.still_waiting_for_full_block = exports.have_full_block = exports.get_deepest_child_by_chain_id = exports.get_incomplete_chain = exports.find_incomplete_block_by_hash_and_chain_id = exports.find_block_by_hash_and_chain_id = exports.add_received_block = exports.find_max_depth = exports.add_subtree_to_received_non_full = exports.find_number_of_incomplete_blocks = exports.add_block_to_incomplete = exports.find_incomplete_block = exports.is_in_incomplete = exports.is_incomplete_hash = exports.remove_one_chain = exports.find_number_of_nodes = exports.add_block_by_parent_hash = exports.insert_subtree_by_hash = exports.insert_one_node = exports.insert_block_only_by_hash = exports.find_block_by_hash = exports.initBlockChains = exports.test = exports.findBlock = exports.getDifficulty = exports.addBlockToChain = exports.replaceChain = exports.isValidBlockStructure = exports.getAccountBalance = exports.getMyUnspentTransactionOutputs = exports.handleReceivedTransaction = exports.sendTransaction = exports.getLatestBlock = exports.getUnspentTxOuts = exports.getBlockchain = exports.Block = exports.NetworkBlock = void 0;
const CryptoJS = require("crypto-js");
const _ = require("lodash");
const p2p_1 = require("./p2p");
const transaction_1 = require("./transaction");
const transactionPool_1 = require("./transactionPool");
const util_1 = require("./util");
const wallet_1 = require("./wallet");
const block_1 = require("./block");
Object.defineProperty(exports, "NetworkBlock", { enumerable: true, get: function () { return block_1.NetworkBlock; } });
Object.defineProperty(exports, "Block", { enumerable: true, get: function () { return block_1.Block; } });
const Configuration_1 = require("./Configuration");
// 4 chains
let blockchains;
let inBlockchains;
let deepest;
// the unspent txOut of genesis block is set to unspentTxOuts on startup
let unspentTxOuts = transaction_1.processTransactions([], [], 0);
const getBlockchain = () => blockchains;
exports.getBlockchain = getBlockchain;
const getUnspentTxOuts = () => _.cloneDeep(unspentTxOuts);
exports.getUnspentTxOuts = getUnspentTxOuts;
// and txPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut) => {
    console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
    unspentTxOuts = newUnspentTxOut;
};
const getLatestBlock = (chainID = 0) => blockchains[blockchains.length - 1];
exports.getLatestBlock = getLatestBlock;
// in seconds
const BLOCK_GENERATION_INTERVAL = 10;
// in blocks
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;
const getDifficulty = (chainID, aBlockchain) => {
    const latestBlock = aBlockchain[blockchains.length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(chainID, latestBlock, aBlockchain);
    }
    else {
        return latestBlock.difficulty;
    }
};
exports.getDifficulty = getDifficulty;
const getAdjustedDifficulty = (chainID, latestBlock, aBlockchain) => {
    const prevAdjustmentBlock = aBlockchain[blockchains.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
    if (timeTaken < timeExpected / 2) {
        return prevAdjustmentBlock.difficulty + 1;
    }
    else if (timeTaken > timeExpected * 2) {
        return prevAdjustmentBlock.difficulty - 1;
    }
    else {
        return prevAdjustmentBlock.difficulty;
    }
};
const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);
// gets the unspent transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
    return wallet_1.findUnspentTxOuts(wallet_1.getPublicFromWallet(), getUnspentTxOuts());
};
exports.getMyUnspentTransactionOutputs = getMyUnspentTransactionOutputs;
///////////////////////////////////////////////////////////////////////////////////////////////
let received_non_full_blocks;
let waiting_for_full_blocks;
let processed_full_blocks = 0;
let total_received_blocks = 0;
let mined_blocks = 0;
let receiving_latency = 0;
let receving_total = 0;
let commited_latency;
let commited_total;
let partially_latency;
let partially_total;
const initBlockChains = () => {
    console.log("Init BlockChain");
    blockchains = [];
    inBlockchains = [];
    deepest = [];
    for (let i = 0; i < Configuration_1.default.MAX_CHAINS; i++) {
        let initHash = i;
        let newBlock = bootstrap_chain(initHash);
        newBlock.is_full_block = false;
        newBlock.nb = new block_1.NetworkBlock();
        newBlock.nb.depth = 0;
        newBlock.rank = 0;
        newBlock.nextRank = 0;
        newBlock.nb.time_mined = 0;
        newBlock.nb.time_received = 0;
        newBlock.chainID = i;
        newBlock.nb.time_commited = [];
        newBlock.nb.time_partial = [];
        for (let j = 0; j < Configuration_1.default.NO_T_DISCARDS; j++) {
            newBlock.nb.time_commited.push(1);
            newBlock.nb.time_partial.push(1);
        }
        blockchains.push(newBlock);
        inBlockchains.push(null);
        deepest.push(newBlock);
    }
    received_non_full_blocks = new Map();
    waiting_for_full_blocks = new Map();
    processed_full_blocks = 0;
    total_received_blocks = 0;
    mined_blocks = 0;
    commited_latency = [];
    commited_total = [];
    partially_latency = [];
    partially_total = [];
    receiving_latency = receving_total = 0;
    for (let j = 0; j < Configuration_1.default.NO_T_DISCARDS; j++) {
        commited_latency.push(0);
        commited_total.push(0);
        partially_latency.push(0);
        partially_total.push(0);
    }
    console.log("Init BlockChains Done");
};
exports.initBlockChains = initBlockChains;
function bootstrap_chain(initial_hash) {
    const genesisTransaction = {
        'txIns': [{ 'signature': '', 'txOutId': '', 'txOutIndex': 0 }],
        'txOuts': [{
                'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
                'amount': 50
            }],
        'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
    };
    let b = new block_1.Block(0, "", "", 0, [genesisTransaction], 0, 0, 0, 0, 0);
    b.is_full_block = false;
    b.hash = initial_hash;
    b.left = null;
    b.right = null;
    b.child = null;
    b.parent = null;
    b.sibling = null;
    b.nb = null;
    return b;
}
function find_block_by_hash(b, hash) {
    if (null == b)
        return null;
    if (b.hash > hash)
        return find_block_by_hash(b.left, hash);
    else if (b.hash < hash)
        return find_block_by_hash(b.right, hash);
    return b;
}
exports.find_block_by_hash = find_block_by_hash;
function insert_block_only_by_hash(r, hash, newnode) {
    if (null == r) {
        let t = new block_1.Block(0, "", "", 0, [], 0, 0, 0, 0, 0);
        t.hash = hash;
        t.is_full_block = false;
        t.left = t.right = t.child = t.sibling = t.parent = null;
        newnode = t;
        return { r: t, newnode };
    }
    if (r.hash >= hash)
        r.left = insert_block_only_by_hash(r.left, hash, newnode).r;
    else if (r.hash < hash)
        r.right = insert_block_only_by_hash(r.right, hash, newnode).r;
    return { r, newnode };
}
exports.insert_block_only_by_hash = insert_block_only_by_hash;
function insert_one_node(r, subtree) {
    if (null == r)
        return subtree;
    if (null == subtree)
        return r;
    if (r.hash > subtree.hash) {
        if (r.left == null) {
            r.left = subtree;
        }
        else
            r.left = insert_one_node(r.left, subtree);
    }
    else if (r.hash < subtree.hash) {
        if (r.right == null) {
            r.right = subtree;
        }
        else
            r.right = insert_one_node(r.right, subtree);
    }
    else {
        console.log("Wrong: Same hash");
    }
    return r;
}
exports.insert_one_node = insert_one_node;
function insert_subtree_by_hash(r, subtree) {
    if (null == subtree)
        return r;
    let left = subtree.left;
    let right = subtree.right;
    subtree.left = subtree.right = null;
    r = insert_one_node(r, subtree);
    r = insert_subtree_by_hash(r, left);
    r = insert_subtree_by_hash(r, right);
    return r;
}
exports.insert_subtree_by_hash = insert_subtree_by_hash;
function add_block_by_parent_hash(root, parent, hash) {
    // Find the parent block node by parent's Int64
    let p = find_block_by_hash(root, parent);
    if (null == p) {
        console.log("Cannot find parent for ");
        return { root, added: false };
    }
    // Insert the new node (of the child)
    const { r, newnode } = insert_block_only_by_hash(root, hash, null);
    if (null == newnode) {
        console.log("Something is wrong, new node is null in 'add_child' ");
        return { root, added: false };
    }
    // Set the parent of the new node
    newnode.parent = p;
    // Set the new node as one of parents children
    if (null == p.child) {
        p.child = newnode;
    }
    else {
        let z = p.child;
        while (z.sibling != null)
            z = z.sibling;
        z.sibling = newnode;
    }
    return { root, added: true };
}
exports.add_block_by_parent_hash = add_block_by_parent_hash;
function find_number_of_nodes(r) {
    if (null == r)
        return 0;
    let n = 0;
    let c = r.child;
    while (null != c) {
        n += find_number_of_nodes(c);
        c = c.sibling;
    }
    return 1 + n;
}
exports.find_number_of_nodes = find_number_of_nodes;
//Incomplete Part
function remove_one_chain(l, to_be_removed) {
    if (null == l)
        return null;
    if (l == to_be_removed) {
        let t = l.next;
        return t;
    }
    else {
        let t = l;
        while (null != t && t.next != to_be_removed)
            t = t.next;
        if (t.next == to_be_removed) {
            t.next = t.next.next;
        }
        return l;
    }
}
exports.remove_one_chain = remove_one_chain;
function is_incomplete_hash(l, hash) {
    if (null == l)
        return null;
    let t = l;
    while (null != l && l.b.hash != hash)
        l = l.next;
    if (null != l && null != l.b && l.b.hash == hash)
        return l;
    return null;
}
exports.is_incomplete_hash = is_incomplete_hash;
function is_in_incomplete(l, parent_hash, child_hash) {
    if (null == l)
        return false;
    let t = l;
    while (null != t) {
        let b = find_block_by_hash(t.b, child_hash);
        if (null != b && b.parent != null && b.parent.hash == parent_hash)
            return true;
        t = t.next;
    }
    return false;
}
exports.is_in_incomplete = is_in_incomplete;
function find_incomplete_block(l, child_hash) {
    if (null == l)
        return null;
    let t = l;
    while (null != t) {
        let b = find_block_by_hash(t.b, child_hash);
        if (null != b)
            return b;
        t = t.next;
    }
    return null;
}
exports.find_incomplete_block = find_incomplete_block;
function add_block_to_incomplete(l, parent_hash, child_hash) {
    if (null == l) {
        let bl = null;
        bl = bootstrap_chain(parent_hash);
        bl = add_block_by_parent_hash(bl, parent_hash, child_hash).root;
        let bi = new block_1.IncompleteBlock();
        bi.b = bl;
        bi.next = null;
        bi.last_asked = 0;
        bi.no_asks = 0;
        return bi;
    }
    let tmp = l, penultimate;
    let ch, ph = null;
    while (null != tmp) {
        if (null == ch)
            ch = (find_block_by_hash(tmp.b, child_hash) != null) ? tmp : null;
        if (null == ph)
            ph = (find_block_by_hash(tmp.b, parent_hash) != null) ? tmp : null;
        penultimate = tmp;
        tmp = tmp.next;
    }
    // Neither parent nor child hash has been found
    if (null == ch && null == ph) {
        let bl = null;
        bl = bootstrap_chain(parent_hash);
        bl = add_block_by_parent_hash(bl, parent_hash, child_hash).root;
        let bi = new block_1.IncompleteBlock();
        bi.b = bl;
        bi.next = null;
        bi.last_asked = 0;
        bi.no_asks = 0;
        penultimate.next = bi;
    }
    else if (null == ch) {
        ph.b = add_block_by_parent_hash(ph.b, parent_hash, child_hash).root;
    }
    else if (null == ph) {
        let bl = bootstrap_chain(parent_hash);
        let tmp = ch.b;
        bl = insert_subtree_by_hash(bl, ch.b);
        bl.child = tmp;
        tmp.parent = bl;
        ch.b = bl;
        ch.last_asked = 0;
        ch.no_asks = 0;
    }
    else {
        let Ztmp = ch.b;
        ph.b = insert_subtree_by_hash(ph.b, ch.b);
        let parent_block = find_block_by_hash(ph.b, parent_hash);
        Ztmp.parent = parent_block;
        let tmp = parent_block.child;
        if (null == tmp)
            parent_block.child = Ztmp;
        else {
            while (tmp.sibling != null)
                tmp = tmp.sibling;
            tmp.sibling = Ztmp;
        }
        l = remove_one_chain(l, ch);
    }
    return l;
}
exports.add_block_to_incomplete = add_block_to_incomplete;
function find_number_of_incomplete_blocks(l) {
    if (null == l)
        return 0;
    let no = 0;
    while (null != l) {
        no += find_number_of_nodes(l.b);
        l = l.next;
    }
    return no;
}
exports.find_number_of_incomplete_blocks = find_number_of_incomplete_blocks;
//print fuinction
function print_blocks(root) {
    if (null == root)
        return;
    print_blocks(root.left);
    console.log("%8lx : %4d : %8lx : %d %d %d %d %d :  %d \n", root.hash, root.nb.depth, (root.parent == null) ? 0 : root.parent.hash, root.left != null, root.right != null, root.child != null, root.parent != null, root.sibling != null, root.nb.depth);
    print_blocks(root.right);
}
function print_full_tree(root) {
    if (null == root)
        return;
    console.log(" << hex <<" + root.hash + " << dec << (" + root.nb.depth + ") <<   :  ");
    let t = root.child;
    while (null != t) {
        console.log(" << hex <<" + t.hash + "<< ");
        t = t.sibling;
    }
    t = root.child;
    while (null != t) {
        if (t.child != null)
            print_full_tree(t);
        t = t.sibling;
    }
}
function print_all_incomplete_chains(l) {
    if (null == l)
        return;
    print_full_tree(l.b);
    print_all_incomplete_chains(l.next);
}
function print_hash_tree(root) {
    if (null == root)
        return;
    print_hash_tree(root.left);
    console.log("Z: %lx\n", root.hash);
    print_hash_tree(root.right);
}
///////////////////////////////////////
/*
 * Add the block to the main/incomplete chain
 * Return true if the parent hash is not in any of the main/incomplete chains
 */
const add_received_block = (chain_id, parent, hash, nb) => {
    let added = false;
    let isIncomplete = false;
    // If block is already in the chain, then do nothing
    if (find_block_by_hash(blockchains[chain_id], hash) != null)
        return { added, isIncomplete };
    added = true;
    // If parent hash is already in the tree, then just add the child
    if (find_block_by_hash(blockchains[chain_id], parent) != null) {
        // Check if child hash is in incompletes
        let bi = is_incomplete_hash(inBlockchains[chain_id], hash);
        if (bi != null) {
            let parent_block = find_block_by_hash(blockchains[chain_id], parent);
            let child_block = bi.b;
            blockchains[chain_id] = insert_subtree_by_hash(blockchains[chain_id], child_block);
            add_subtree_to_received_non_full(child_block, chain_id);
            child_block.parent = parent_block;
            let tmp = parent_block.child;
            if (null == tmp)
                parent_block.child = child_block;
            else {
                while (tmp.sibling != null)
                    tmp = tmp.sibling;
                tmp.sibling = child_block;
            }
            inBlockchains[chain_id] = remove_one_chain(inBlockchains[chain_id], bi);
        }
        else {
            // Just add the (parent, hash)
            blockchains[chain_id] = add_block_by_parent_hash(blockchains[chain_id], parent, hash).root;
            // Add to the non-full-blocks
            if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size - 1] && !have_full_block(chain_id, hash)) {
                //   received_non_full_blocks.push(make_pair(hash, make_pair(chain_id, 0)));
                received_non_full_blocks[hash] = chain_id;
                total_received_blocks++;
            }
        }
        // Add full block info
        let bz = find_block_by_hash(blockchains[chain_id], hash);
        if (null != bz) {
            bz.nb = new block_1.NetworkBlock();
            added = true;
            //  Update deepest
            let old_depth = deepest[chain_id].nb.depth;
            let deep_last = find_max_depth(bz);
            if (deep_last.nb.depth > old_depth)
                deepest[chain_id] = deep_last;
        }
    }
    // Else, need to add to incomplete chain and ask for more 
    else {
        if (is_in_incomplete(inBlockchains[chain_id], parent, hash)) {
            added = false;
            return { added, isIncomplete };
        }
        // Add this to incomplete chain
        inBlockchains[chain_id] = add_block_to_incomplete(inBlockchains[chain_id], parent, hash);
        let bz = find_incomplete_block(inBlockchains[chain_id], hash);
        if (null != bz) {
            bz.nb = new block_1.NetworkBlock();
        }
        // Ask for parent hash
        isIncomplete = true;
        return { added, isIncomplete };
    }
    isIncomplete = false;
    return { added, isIncomplete };
};
exports.add_received_block = add_received_block;
function add_subtree_to_received_non_full(b, chain_id) {
    if (null == b)
        return;
    let hash = b.hash;
    if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size - 1] && !have_full_block(chain_id, hash)) {
        received_non_full_blocks[hash] = chain_id;
        total_received_blocks++;
    }
    let c = b.child;
    while (null != c) {
        add_subtree_to_received_non_full(c, chain_id);
        c = c.sibling;
    }
}
exports.add_subtree_to_received_non_full = add_subtree_to_received_non_full;
function find_max_depth(r) {
    if (null == r)
        return null;
    let mx = r;
    let tmp = r.child;
    while (null != tmp) {
        let fm = find_max_depth(tmp);
        if (null != fm && fm.nb.depth > mx.nb.depth)
            mx = fm;
        tmp = tmp.sibling;
    }
    return mx;
}
exports.find_max_depth = find_max_depth;
function have_full_block(chain_id, hash) {
    let bz = find_block_by_hash(blockchains[chain_id], hash);
    if (null != bz && bz.is_full_block)
        return true;
    return false;
}
exports.have_full_block = have_full_block;
function find_block_by_hash_and_chain_id(hash, chain_id) {
    return find_block_by_hash(blockchains[chain_id], hash);
}
exports.find_block_by_hash_and_chain_id = find_block_by_hash_and_chain_id;
function find_incomplete_block_by_hash_and_chain_id(hash, chain_id) {
    return find_incomplete_block(inBlockchains[chain_id], hash);
}
exports.find_incomplete_block_by_hash_and_chain_id = find_incomplete_block_by_hash_and_chain_id;
function get_incomplete_chain(chain_id) {
    return inBlockchains[chain_id];
}
exports.get_incomplete_chain = get_incomplete_chain;
function get_deepest_child_by_chain_id(chain_id) {
    if (null == deepest[chain_id]) {
        console.log("Something is wrong with get_deepest_child_by_chain_id\n");
    }
    return deepest[chain_id];
}
exports.get_deepest_child_by_chain_id = get_deepest_child_by_chain_id;
function still_waiting_for_full_block(hash, time_of_now) {
    if (waiting_for_full_blocks[hash] == waiting_for_full_blocks.values()[waiting_for_full_blocks.size - 1]) {
        waiting_for_full_blocks[hash] = time_of_now;
        return true;
    }
    return false;
}
exports.still_waiting_for_full_block = still_waiting_for_full_block;
function add_block_by_parent_hash_and_chain_id(parent_hash, new_block, chain_id, nb) {
    add_block_by_parent_hash(blockchains[chain_id], parent_hash, new_block);
    let bz = find_block_by_hash(blockchains[chain_id], new_block);
    if (null != bz) {
        this.deepest[chain_id] = bz;
        bz.nb = new block_1.NetworkBlock();
    }
}
exports.add_block_by_parent_hash_and_chain_id = add_block_by_parent_hash_and_chain_id;
function get_incomplete_chain_hashes(chain_id, time_of_now) {
    let hashes = [];
    let t = inBlockchains[chain_id];
    while (null != t) {
        let nextt = t.next;
        if (time_of_now - t.last_asked > Configuration_1.default.ASK_FOR_INCOMPLETE_INDIVIDUAL_MILLISECONDS) {
            t.last_asked = time_of_now;
            t.no_asks++;
            if (t.no_asks > Configuration_1.default.NO_ASKS_BEFORE_REMOVING)
                this.inBlockchains[chain_id] = this.remove_one_chain(this.inBlockchains[chain_id], t);
            else
                hashes.push(t.b.hash);
        }
        t = nextt;
    }
    return hashes;
}
exports.get_incomplete_chain_hashes = get_incomplete_chain_hashes;
function set_block_full(chain_id, hash, misc) {
    if (received_non_full_blocks[hash] != received_non_full_blocks.values()[received_non_full_blocks.size])
        received_non_full_blocks.delete(hash);
    if (waiting_for_full_blocks[hash] != waiting_for_full_blocks.values()[waiting_for_full_blocks.size])
        waiting_for_full_blocks.delete(hash);
    let bz = find_block_by_hash(this.chains[chain_id], hash);
    if (null != bz) {
        bz.is_full_block = true;
        processed_full_blocks++;
        // Define time_received
        if (bz.nb != null) {
            let time_of_now = Date.now();
            if (time_of_now > bz.nb.time_mined) {
                bz.nb.time_received = time_of_now;
                receving_total++;
                receiving_latency += bz.nb.time_received - bz.nb.time_mined;
            }
            else
                bz.nb.time_received = bz.nb.time_mined;
            //if (STORE_BLOCKS && (hash % BLOCKS_STORE_FREQUENCY) == 0) {
            //    string filename = string(FOLDER_BLOCKS) + "/" + my_ip + "-" + to_string(my_port);
            //    ofstream file;
            //    file.open(filename, std:: ios_base:: app);
            //    file << "0 " << hex << hash << dec << " " << (bz.nb.time_received - bz.nb.time_mined) << endl;
            //    file.close();
            //}
        }
    }
}
exports.set_block_full = set_block_full;
function add_mined_block() {
    mined_blocks++;
}
exports.add_mined_block = add_mined_block;
function get_non_full_blocks(time_of_now) {
    let nfb = new Map();
    let to_remove = [];
    //received_non_full_blocks.forEach((it, keys) => {
    //    if (Date.now() - itsecond.second > ASK_FOR_FULL_BLOCKS_INDIVIDUAL_EACH_MILLISECONDS) {
    //        it.second = make_pair(it -> second.first, time_of_now);
    //        let bz: Block = find_block_by_hash(blockchains[it.second.first], it -> first);
    //        if (null != bz && !(bz.is_full_block))
    //            nfb.push_back(make_pair(it -> first, it -> second.first));
    //        else if (NULL != bz && bz -> is_full_block)
    //            to_remove.push_back(it -> first);
    //        if (nfb.size >= MAX_ASK_NON_FULL_IN_ONE_GO) break;
    //    }
    //})
    //for (auto it = received_non_full_blocks.begin(); it != received_non_full_blocks.end(); it++ )
    for (let i = 0; i < to_remove.length; i++)
        if (received_non_full_blocks[to_remove[i]] != received_non_full_blocks.values()[received_non_full_blocks.size - 1])
            received_non_full_blocks.delete(to_remove[i]);
    return nfb;
}
exports.get_non_full_blocks = get_non_full_blocks;
function remove_waiting_blocks(time_of_now) {
    let to_remove = [];
    //for (auto it = waiting_for_full_blocks.begin(); it != waiting_for_full_blocks.end(); it++ ) {
    //    if (time_of_now - it -> second > MAX_WAIT_FOR_FULL_BLOCK_MILLSECONDS)
    //        //waiting_for_full_blocks.erase( (it++)->first );
    //        to_remove.push_back(it -> first);
    //}
    for (let i = 0; i < to_remove.length; i++)
        if (waiting_for_full_blocks[to_remove[i]] != waiting_for_full_blocks.values()[waiting_for_full_blocks.size - 1])
            waiting_for_full_blocks.delete(to_remove[i]);
}
exports.remove_waiting_blocks = remove_waiting_blocks;
const STORE_BLOCKS = true;
const BLOCKS_STORE_FREQUENCY = 0;
const FOLDER_BLOCKS = "";
const my_ip = "";
const my_port = "";
function update_blocks_commited_time() {
    let time_of_now = Date.now();
    for (let j = 0; j < Configuration_1.default.NO_T_DISCARDS; j++) {
        /*
         * Update partial times
         */
        for (let i = 0; i < Configuration_1.default.CHAINS; i++) {
            // Discard the last 
            let t = deepest[i];
            let count = 0;
            while (null != t && count++ < Configuration_1.default.T_DISCARD[j])
                t = t.parent;
            if (null == t)
                continue;
            while (null != t) {
                if (t.is_full_block && null != t.nb && 0 == t.nb.time_partial[j] && time_of_now > t.nb.time_mined) {
                    t.nb.time_partial[j] = time_of_now;
                    partially_total[j]++;
                    partially_latency[j] += t.nb.time_partial[j] - t.nb.time_mined;
                    if (STORE_BLOCKS && (t.hash % BLOCKS_STORE_FREQUENCY) == 0) {
                        let filename = FOLDER_BLOCKS + "/" + my_ip + "-" + my_port;
                        //ofstream file;
                        //file.open(filename, std:: ios_base:: app);
                        //file << "1 " << hex << t -> hash << dec << " " << (t -> nb -> time_partial[j] - t -> nb -> time_mined) << " " << j << endl;
                        //file.close();
                    }
                }
                t = t.parent;
            }
        }
        /*
         * Full commit times
         */
        // Find the minimal next_rank
        let stop_this_j = false;
        let confirm_bar = -1;
        for (let i = 0; i < Configuration_1.default.CHAINS; i++) {
            // Discard the last 
            let t = deepest[i];
            let count = 0;
            while (null != t && count++ < Configuration_1.default.T_DISCARD[j])
                t = t.parent;
            if (null == t) {
                stop_this_j = true;
                break;
                //return;
            }
            if (t.nb == null) {
                stop_this_j = true;
                break;
                //return;
            }
            if (stop_this_j)
                break;
            if (t.nb.next_rank < confirm_bar)
                confirm_bar = t.nb.next_rank;
        }
        if (stop_this_j)
            continue;
        if (confirm_bar < 0)
            continue;
        // Update commited times
        for (let i = 0; i < Configuration_1.default.CHAINS; i++) {
            // Discard the last 
            let t = deepest[i];
            let count = 0;
            while (null != t && count++ < Configuration_1.default.T_DISCARD[j])
                t = t.parent;
            if (null == t)
                continue;
            while (null != t) {
                if (t.is_full_block && null != t.nb && t.nb.next_rank < confirm_bar && 0 == t.nb.time_commited[j] && time_of_now > t.nb.time_mined) {
                    t.nb.time_commited[j] = time_of_now;
                    commited_total[j]++;
                    commited_latency[j] += t.nb.time_commited[j] - t.nb.time_mined;
                    if (STORE_BLOCKS && (t.hash % BLOCKS_STORE_FREQUENCY) == 0) {
                        //let filename = string(FOLDER_BLOCKS) + "/" + my_ip + "-" + to_string(my_port);
                        //ofstream file;
                        //file.open(filename, std:: ios_base:: app);
                        //file << "2 " << hex << t -> hash << dec << " " << (t -> nb -> time_commited[j] - t -> nb -> time_mined) << " " << j << endl;
                        //file.close();
                    }
                }
                t = t.parent;
            }
        }
    }
}
exports.update_blocks_commited_time = update_blocks_commited_time;
///////////////////////////////////////////////////////////////////////////////////////////////
const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    let nonce = 0;
    let chainID = 0;
    let rank = 0;
    let nextRank = 0;
    while (true) {
        const hash = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new block_1.Block(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID, rank, nextRank);
        }
        nonce++;
    }
};
exports.findBlock = findBlock;
const getAccountBalance = () => {
    return wallet_1.getBalance(wallet_1.getPublicFromWallet(), getUnspentTxOuts());
};
exports.getAccountBalance = getAccountBalance;
const sendTransaction = (address, amount) => {
    const tx = wallet_1.createTransaction(address, amount, wallet_1.getPrivateFromWallet(), getUnspentTxOuts(), transactionPool_1.getTransactionPool());
    transactionPool_1.addToTransactionPool(tx, getUnspentTxOuts());
    p2p_1.broadCastTransactionPool();
    return tx;
};
exports.sendTransaction = sendTransaction;
const calculateHashForBlock = (block) => calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);
const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();
const isValidBlockStructure = (block) => {
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'object';
};
exports.isValidBlockStructure = isValidBlockStructure;
const isValidNewBlock = (newBlock, previousBlock) => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid block structure: %s', JSON.stringify(newBlock));
        return false;
    }
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }
    else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    }
    else if (!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    }
    else if (!hasValidHash(newBlock)) {
        return false;
    }
    return true;
};
const getAccumulatedDifficulty = (aBlockchain) => {
    return aBlockchain
        .map((block) => block.difficulty)
        .map((difficulty) => Math.pow(2, difficulty))
        .reduce((a, b) => a + b);
};
const isValidTimestamp = (newBlock, previousBlock) => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp)
        && newBlock.timestamp - 60 < getCurrentTimestamp();
};
const hasValidHash = (block) => {
    if (!hashMatchesBlockContent(block)) {
        console.log('invalid hash, got:' + block.hash);
        return false;
    }
    if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
    }
    return true;
};
const hashMatchesBlockContent = (block) => {
    const Int64 = calculateHashForBlock(block);
    return Int64 === block.hash;
};
const hashMatchesDifficulty = (hash, difficulty) => {
    const hashInBinary = util_1.hexToBinary(hash);
    const requiredPrefix = '0'.repeat(difficulty);
    return hashInBinary.startsWith(requiredPrefix);
};
/*
    Checks if the given blockchain is valid. Return the unspent txOuts if the chain is valid
 */
const isValidChain = (blockchainToValidate) => {
    console.log('isValidChain:');
    console.log(JSON.stringify(blockchainToValidate));
    const isValidGenesis = (block) => {
        //return JSON.stringify(block) === JSON.stringify(genesisBlock);
        return JSON.stringify(block) === JSON.stringify("");
    };
    if (!isValidGenesis(blockchainToValidate[0])) {
        return null;
    }
    /*
    Validate each block in the chain. The block is valid if the block structure is valid
      and the transaction are valid
     */
    let aUnspentTxOuts = [];
    for (let i = 0; i < blockchainToValidate.length; i++) {
        const currentBlock = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }
        aUnspentTxOuts = transaction_1.processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === null) {
            console.log('invalid transactions in blockchain');
            return null;
        }
    }
    return aUnspentTxOuts;
};
const addBlockToChain = (newBlock, chainID = 0) => {
    if (isValidNewBlock(newBlock, getLatestBlock(chainID))) {
        const retVal = transaction_1.processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (retVal === null) {
            console.log('block is not valid in terms of transactions');
            return false;
        }
        else {
            blockchains.push(newBlock);
            setUnspentTxOuts(retVal);
            transactionPool_1.updateTransactionPool(unspentTxOuts);
            return true;
        }
    }
    return false;
};
exports.addBlockToChain = addBlockToChain;
const replaceChain = (newBlocks, chainID = 0) => {
    const aUnspentTxOuts = isValidChain(newBlocks);
    const validChain = aUnspentTxOuts !== null;
    if (validChain &&
        getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchains = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        transactionPool_1.updateTransactionPool(unspentTxOuts);
        p2p_1.broadcastLatest();
    }
    else {
        console.log('Received blockchain invalid');
    }
};
exports.replaceChain = replaceChain;
const handleReceivedTransaction = (transaction) => {
    transactionPool_1.addToTransactionPool(transaction, getUnspentTxOuts());
};
exports.handleReceivedTransaction = handleReceivedTransaction;
const test = () => {
    console.log("Test Start");
    let b = get_deepest_child_by_chain_id(1);
    console.log(b.chainID);
    console.log("Test End");
};
exports.test = test;
//# sourceMappingURL=blockchain.js.map