import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import {broadcastLatest, broadCastTransactionPool} from './p2p';
import {
    getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut
} from './transaction';
import {addToTransactionPool, getTransactionPool, updateTransactionPool} from './transactionPool';
import {hexToBinary} from './util';
import {createTransaction, findUnspentTxOuts, getBalance, getPrivateFromWallet, getPublicFromWallet} from './wallet';
import * as Int64 from 'node-int64';
import { NetworkBlock, Block, IncompleteBlock } from './block';
import config from './Configuration';


type BlockHash = Int64;

// 4 chains
let blockchains: Block[];
let inBlockchains: IncompleteBlock[];
let deepest: Block[];

// the unspent txOut of genesis block is set to unspentTxOuts on startup
let unspentTxOuts: UnspentTxOut[] = processTransactions([], [], 0);

const getBlockchain = (): Block[] => blockchains;

const getUnspentTxOuts = (): UnspentTxOut[] => _.cloneDeep(unspentTxOuts);

// and txPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut: UnspentTxOut[]) => {
    console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
    unspentTxOuts = newUnspentTxOut;
};

const getLatestBlock = (chainID = 0): Block => blockchains[blockchains.length - 1];

// in seconds
const BLOCK_GENERATION_INTERVAL: number = 10;

// in blocks
const DIFFICULTY_ADJUSTMENT_INTERVAL: number = 10;


const getDifficulty = (chainID: number, aBlockchain: Block[]): number => {
    const latestBlock: Block = aBlockchain[blockchains.length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(chainID, latestBlock, aBlockchain);
    } else {
        return latestBlock.difficulty;
    }
};

const getAdjustedDifficulty = (chainID: number, latestBlock: Block, aBlockchain: Block[]) => {
    const prevAdjustmentBlock: Block = aBlockchain[blockchains.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken: number = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
    if (timeTaken < timeExpected / 2) {
        return prevAdjustmentBlock.difficulty + 1;
    } else if (timeTaken > timeExpected * 2) {
        return prevAdjustmentBlock.difficulty - 1;
    } else {
        return prevAdjustmentBlock.difficulty;
    }
};

const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

// gets the unspent transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
    return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};
///////////////////////////////////////////////////////////////////////////////////////////////


let received_non_full_blocks: Map<Int64, number>;
let waiting_for_full_blocks: Map<Int64, number>;
let processed_full_blocks = 0;
let total_received_blocks = 0;
let mined_blocks = 0;
let receiving_latency = 0;
let receving_total = 0;
let commited_latency: number[];
let commited_total: number[];
let partially_latency: number[];
let partially_total: number[];

const initBlockChains = () => {
    console.log("Init BlockChain")

    blockchains = [];
    inBlockchains = [];
    deepest = [];

    for (let i = 0; i < config.MAX_CHAINS; i++) {
        let initHash: Int64 = i;
        let newBlock = bootstrap_chain(initHash);
        newBlock.is_full_block = false;
        newBlock.nb = new NetworkBlock();
        newBlock.nb.depth = 0;
        newBlock.nb.time_mined = 0;
        newBlock.nb.time_received = 0;
        newBlock.chainID = i;
        newBlock.nb.time_commited = [];
        newBlock.nb.time_partial = [];

        for (let j = 0; j < config.NO_T_DISCARDS; j++) {
            newBlock.nb .time_commited.push( 1);
            newBlock.nb. time_partial.push(1);
        }

        blockchains.push(newBlock);
        inBlockchains.push(undefined);
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
    for (let j = 0; j < config. NO_T_DISCARDS; j++) {
        commited_latency.push(0);
        commited_total.push(0);
        partially_latency.push(0);
        partially_total.push(0);
    }

    console.log("Init BlockChains Done");
}


function  bootstrap_chain  (initial_hash: Int64): Block
{
    const genesisTransaction = {
        'txIns': [{ 'signature': '', 'txOutId': '', 'txOutIndex': 0 }],
        'txOuts': [{
            'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
            'amount': 50
        }],
        'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
    };

    let b: Block = new Block(0, "", "", 0, [genesisTransaction], 0, 0, 0);
    b.is_full_block = false;
    b.hash = initial_hash;
    b.left = undefined;
    b.right = undefined;
    b.child = undefined;
    b.parent = undefined;
    b.sibling = undefined;
    b.nb = undefined;

    return b;
}

function find_block_by_hash (b:Block, hash: Int64): Block 
{

    if (undefined == b) return undefined;

    if (b.hash > hash) return find_block_by_hash(b.left, hash);
    else if (b.hash < hash) return find_block_by_hash(b.right, hash);

    return b;
} 

function insert_block_only_by_hash(r: Block, hash: Int64, newnode: Block)
{
    if (undefined == r) {
        let t: Block = new Block(0, "", "", 0, [], 0, 0, 0,);
        t.hash = hash;
        t.is_full_block = false;
        t.left = t.right = t.child = t.sibling = t.parent = undefined;
        newnode = t;
        return [t, t];
    }
    else {
        if (r.hash >= hash) {
            let result = insert_block_only_by_hash(r.left, hash, newnode);
            r.left = result[0];
            newnode = result[1];
        }
        else if (r.hash < hash) {
            let result = insert_block_only_by_hash(r.right, hash, newnode);
            r.right = result[0];
            newnode = result[1];
        }

        return [r, newnode]
    }
}

function insert_one_node(r: Block, subtree: Block) {
    if (undefined == r) return subtree;
    if (undefined == subtree) return r;

    if (r.hash > subtree.hash) {
        if (r.left == undefined) {
            r.left = subtree;
        }
        else
            r.left = insert_one_node(r.left, subtree);
    }
    else if (r.hash < subtree. hash) {
        if (r.right == undefined) {
            r. right = subtree;
        }
        else
            r.right = insert_one_node(r.right, subtree);
    }
    else {
        console.log("Wrong: Same hash");
    }

    return r;
}

function insert_subtree_by_hash(r: Block, subtree: Block) {
    if (undefined == subtree) return r;

    let left = subtree.left;
    let right = subtree.right;

    subtree.left = subtree.right = undefined;
    r = insert_one_node(r, subtree);

    r = insert_subtree_by_hash(r, left);
    r = insert_subtree_by_hash(r, right);

    return r;
}

function add_block_by_parent_hash(root: Block, parent: Int64, hash: Int64): { root: Block, added: boolean } //need
{
    // Find the parent block node by parent's Int64
    let p: Block = find_block_by_hash( root, parent);
    if (undefined == p) {
        console.log("Cannot find parent for ");
        return { root, added:false};
    }
    // Insert the new node (of the child)
    console.log("insert_block_only_by_hash: ", hash);
    let result = insert_block_only_by_hash(root, hash, undefined);
    root = result[0];
    let newnode: Block = result[1];
    if (undefined == newnode) {
        console.log( "Something is wrong, new node is undefined in 'add_child' ")
        return { root, added: false };
    }

    // Set the parent of the new node
    newnode. parent = p;

    // Set the new node as one of parents children
    if (undefined == p. child) {
        p .child = newnode;
    }
    else {
       let z:Block = p. child;
        while (z .sibling != undefined) z = z .sibling;
        z.sibling = newnode;
    }
    console.log("Add Block success");
    return { root, added: true };
}

function find_number_of_nodes(r: Block):number
{
    if (undefined == r) return 0;

    let n = 0;
    let c:Block = r. child;
    while (undefined != c) {
        n += find_number_of_nodes(c);
        c = c.sibling;
    }

    return 1 + n;
}

//Incomplete Part
function remove_one_chain(l: IncompleteBlock, to_be_removed: IncompleteBlock): IncompleteBlock {
    if (undefined == l)
        return undefined;

    if (l == to_be_removed) {
        let t: IncompleteBlock = l .next;
        return t;
    }
    else {
        let t: IncompleteBlock = l;
        while (undefined != t && t .next != to_be_removed)
            t = t . next;

        if (t. next == to_be_removed) {
            t. next = t.next.next;
        }

        return l;
    }
}

function is_incomplete_hash(l: IncompleteBlock, hash: Int64) {
    if (undefined == l) return undefined;

    let t: IncompleteBlock = l;
    while (undefined != l && l. b .hash != hash)
        l = l .next;

    if (undefined != l && undefined != l. b && l. b. hash == hash)
        return l;

    return undefined;
}

function is_in_incomplete(l: IncompleteBlock, parent_hash: Int64, child_hash: Int64): boolean {
    if (undefined == l) return false;

    let t: IncompleteBlock = l;
    while (undefined != t) {
        let b:Block = find_block_by_hash(t.b, child_hash);
        if (undefined != b && b.parent != undefined && b. parent. hash == parent_hash)
            return true;
        t = t.next;
    }

    return false;
}

function find_incomplete_block(l: IncompleteBlock, child_hash:Int64):Block
{

    if (undefined == l) return undefined;

    let t: IncompleteBlock = l;
    while (undefined != t) {
        let b:Block = find_block_by_hash(t.b, child_hash);
        if (undefined != b)
            return b;
        t = t. next;
    }

    return undefined;
}

function add_block_to_incomplete(l: IncompleteBlock, parent_hash: Int64, child_hash: Int64)
{

    if (undefined == l) {

        let bl:Block = undefined;
        bl = bootstrap_chain(parent_hash);
        bl = add_block_by_parent_hash(bl, parent_hash, child_hash).root;

        let bi: IncompleteBlock = new IncompleteBlock();
        bi.b = bl;
        bi.next = undefined;
        bi.last_asked = 0;
        bi.no_asks = 0;
        return bi;
    }

    let tmp: IncompleteBlock = l, penultimate: IncompleteBlock;
    let ch: IncompleteBlock, ph: IncompleteBlock= undefined;
    while (undefined != tmp) {

        if (undefined == ch) ch = (find_block_by_hash(tmp. b, child_hash) != undefined) ? tmp : undefined;
        if (undefined == ph) ph = (find_block_by_hash(tmp.b, parent_hash) != undefined) ? tmp : undefined;

        penultimate = tmp;
        tmp = tmp.next;
    }

    // Neither parent nor child hash has been found
    if (undefined == ch && undefined == ph) {
        let bl:Block = undefined;
        bl = bootstrap_chain(parent_hash);
        bl = add_block_by_parent_hash(bl, parent_hash, child_hash).root;

        let bi: IncompleteBlock = new IncompleteBlock();
        bi.b = bl;
        bi.next = undefined;
        bi.last_asked = 0;
        bi.no_asks = 0;
        penultimate.next = bi;
    }
    else if (undefined == ch) {

        ph.b = add_block_by_parent_hash(ph.b, parent_hash, child_hash).root;
    }
    else if (undefined == ph) {

        let bl:Block = bootstrap_chain(parent_hash);
        let tmp:Block = ch.b;
        bl = insert_subtree_by_hash(bl, ch .b);
        bl. child = tmp;
        tmp. parent = bl;
        ch. b = bl;
        ch. last_asked = 0;
        ch.no_asks = 0;
    }
    else {

        let Ztmp:Block = ch .b;
        ph. b = insert_subtree_by_hash(ph. b, ch .b);
        let parent_block:Block = find_block_by_hash(ph . b, parent_hash);
        Ztmp. parent = parent_block;
        let tmp:Block = parent_block. child;
        if (undefined == tmp)
            parent_block.child = Ztmp;
		else {
            while (tmp.sibling != undefined)
                tmp = tmp .sibling;
            tmp. sibling = Ztmp;
        }

        l = remove_one_chain(l, ch);
    }
    return l;
}

function find_number_of_incomplete_blocks(l: IncompleteBlock): number
{
    if (undefined == l) return 0;

    let no = 0;
    while (undefined != l) {
        no += find_number_of_nodes(l . b);
        l = l . next;
    }

    return no;
}

//print fuinction

function print_blocks_by_BlockChainID() {
    for (let i = 0; i < blockchains.length; i++) {
        console.log("Chain ID: " + i);
        print_blocks(blockchains[i]);
        console.log(" \n");
    }
}

function get_block_by_hash(hash: Int64) {
    for (let i = 0; i < blockchains.length; i++) {
        let b: Block = find_block_by_hash_and_chain_id(hash, i);
        if (b != undefined) {
            console.log("Print Childs");
            print_blocks(b);
            console.log("Print Parent");
            print_parent_blocks(b);
            return find_block_by_hash_and_chain_id(hash, i);
            break;
        }
    }
}

function print_parent_blocks(root: Block) {
    if (undefined == root) return;

    print_parent_blocks(root.parent);
    console.log(" Hash:", root.hash, "Depth:", root.nb.depth, "Rank:", root.nb.rank, " NextRank:", root.nb.next_rank, " | time_partial:", root.nb.time_partial, " | time_commited:", root.nb.time_commited);
}

function  print_blocks( root:Block)
{
    if (undefined == root) return;

    print_blocks(root.child);
    console.log(" Hash:", root.hash, "Depth:", root.nb.depth, "Rank:", root.nb.rank, " NextRank:", root.nb.next_rank, " | time_partial:", root.nb.time_partial,  " | time_commited:", root.nb.time_commited);
}

function  print_full_tree( root:Block)
{
    if (undefined == root) return;

    console.log(" << hex <<" + root.hash + " << dec << (" + root.nb.depth + ") <<   :  ");
    let t: Block = root. child;
    while (undefined != t) {
        console.log(" << hex <<" +  t.hash  + "<< ");
        t = t .sibling;
    }

    t = root.child;
    while (undefined != t) {
        if (t .child != undefined)
            print_full_tree(t);
        t = t.sibling;
    }

}

function print_all_incomplete_chains(l: IncompleteBlock) {
    console.log("print_all_incomplete_chains",l);
    if (undefined == l) return;

    print_full_tree(l.b);
    print_all_incomplete_chains(l.next);

}

function print_hash_tree(root: Block) {
    if (undefined == root) return;

    print_hash_tree(root.left);
    console.log("Z: %lx\n", root.hash);
    print_hash_tree(root. right);
}

///////////////////////////////////////

/*
 * Add the block to the main/incomplete chain
 * Return true if the parent hash is not in any of the main/incomplete chains
 */
const add_received_block = (chain_id: number, parent: Int64, hash: Int64, nb: NetworkBlock): { added: boolean, isIncomplete: boolean } => 
{
    console.log("add_received_block: chain_id:", chain_id);
    let added = false;
    let isIncomplete = false

    // If block is already in the chain, then do nothing
    if (find_block_by_hash(blockchains[chain_id], hash) != undefined) return { added, isIncomplete };

    added = true;


    // If parent hash is already in the tree, then just add the child
    if (find_block_by_hash(blockchains[chain_id], parent) != undefined) {


        // Check if child hash is in incompletes
        let bi: IncompleteBlock = is_incomplete_hash(inBlockchains[chain_id], hash);

        if (bi != undefined) {


            let parent_block: Block = find_block_by_hash(blockchains[chain_id], parent);
            let child_block:Block = bi.b;
            blockchains[chain_id] = insert_subtree_by_hash(blockchains[chain_id], child_block);

            add_subtree_to_received_non_full(child_block, chain_id);


            child_block.parent = parent_block;
            let tmp:Block = parent_block. child;
            if (undefined == tmp)
                parent_block . child = child_block;
			else {
                while (tmp. sibling != undefined)
                    tmp = tmp .sibling;
                tmp.sibling = child_block;
            }


            inBlockchains[chain_id] = remove_one_chain(inBlockchains[chain_id], bi);


        }
        else {
            // Just add the (parent, hash)
            blockchains[chain_id] = add_block_by_parent_hash(blockchains[chain_id], parent, hash).root;

            // Add to the non-full-blocks
            if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size-1] && !have_full_block(chain_id, hash)) {
                //   received_non_full_blocks.push(make_pair(hash, make_pair(chain_id, 0)));
                received_non_full_blocks[hash] = chain_id;
                total_received_blocks++;
            }

        }


        // Add full block info
        let bz: Block = find_block_by_hash(blockchains[chain_id], hash);
        if (undefined != bz) {
            bz.nb = new NetworkBlock();
            bz.nb = nb;
            added = true;

            //  Update deepest
            let old_depth: number = deepest[chain_id].nb.depth;
            let deep_last: Block = find_max_depth(bz);
            if (deep_last. nb. depth > old_depth)
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


        let bz:Block = find_incomplete_block(inBlockchains[chain_id], hash);
        if (undefined != bz) {
            bz.nb = new NetworkBlock();
        }



        // Ask for parent hash
        isIncomplete = true
        return { added, isIncomplete };

    }
    isIncomplete = false
    return { added, isIncomplete };

}

function add_subtree_to_received_non_full(b: Block, chain_id: number) {
    if (undefined == b) return;

    let hash: Int64 = b.hash;
    if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size - 1] && !have_full_block(chain_id, hash)) {
        received_non_full_blocks[hash] = chain_id;
        total_received_blocks++;
    }

    let c: Block = b.child;
    while (undefined != c) {
        add_subtree_to_received_non_full(c, chain_id);
        c = c.sibling;
    }
}

function find_max_depth( r:Block) {
    if (undefined == r) return undefined;

    let mx:Block = r;
    let tmp:Block = r. child;
    while (undefined != tmp) {
        let fm:Block = find_max_depth(tmp);
        if (undefined != fm && fm. nb.depth >mx .nb .depth)
            mx = fm;
        tmp = tmp. sibling;
    }

    return mx;

}

function have_full_block(chain_id: number, hash: Int64): boolean
{
    let bz: Block = find_block_by_hash(blockchains[chain_id], hash);
    if (undefined != bz && bz. is_full_block) return true;
    return false;

}

function find_block_by_hash_and_chain_id(hash: Int64,  chain_id: number):Block
{
    return find_block_by_hash(blockchains[chain_id], hash);

}

function find_incomplete_block_by_hash_and_chain_id(hash: Int64, chain_id: number): Block
{
    return find_incomplete_block(inBlockchains[chain_id], hash);
}



function get_incomplete_chain(chain_id: number): IncompleteBlock
{
    return inBlockchains[chain_id];
}



function get_deepest_child_by_chain_id( chain_id:number)
{
    if (undefined == deepest[chain_id]) {
        console.log("Something is wrong with get_deepest_child_by_chain_id\n")
    }
    return deepest[chain_id];
}

function still_waiting_for_full_block(hash: Int64, time_of_now: number): boolean
{
    if (waiting_for_full_blocks[hash] == waiting_for_full_blocks.values()[waiting_for_full_blocks.size - 1]) {
        waiting_for_full_blocks[hash] = time_of_now;
        return true;
    }
    return false;

}


function add_block_by_parent_hash_and_chain_id(parent_hash: Int64, new_block: Int64, chain_id: number, nb: NetworkBlock)  
{
    console.log("add_block_by_parent_hash_and_chain_id:", parent_hash, new_block, chain_id);

    add_block_by_parent_hash(blockchains[chain_id], parent_hash, new_block);

    let bz: Block = find_block_by_hash(blockchains[chain_id], new_block);
    if (undefined != bz) {
        deepest[chain_id] = bz;
        bz.nb = nb;
    }

}


function get_incomplete_chain_hashes(chain_id: number, time_of_now:number): Int64[]
{
    let hashes: Int64[] = [];
    let t: IncompleteBlock = inBlockchains[chain_id];
    while (undefined != t) {
        let nextt: IncompleteBlock = t.next;
        if (time_of_now - t.last_asked > config.ASK_FOR_INCOMPLETE_INDIVIDUAL_MILLISECONDS) {
            t.last_asked = time_of_now;
            t.no_asks++;
            if (t.no_asks > config.NO_ASKS_BEFORE_REMOVING)
                this.inBlockchains[chain_id] = this.remove_one_chain(this.inBlockchains[chain_id], t);
    		else
            hashes.push(t.b.hash);
        }
        t = nextt;
    }

    return hashes;
}


function set_block_full(chain_id: number, hash: Int64, misc: string)
{
    if (received_non_full_blocks[hash] != received_non_full_blocks.values()[received_non_full_blocks.size])
        received_non_full_blocks.delete(hash);
    if (waiting_for_full_blocks[hash] != waiting_for_full_blocks.values()[waiting_for_full_blocks.size])
        waiting_for_full_blocks.delete(hash);

    let bz:Block = find_block_by_hash(this.chains[chain_id], hash);
    if (undefined != bz) {
        bz.is_full_block = true;
        processed_full_blocks++;

        // Define time_received
        if (bz.nb != undefined) {
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

function  add_mined_block()
{
    mined_blocks++;
}

function get_non_full_blocks(time_of_now: number)
{
    let nfb = new Map<Int64, number>();
    let to_remove: Int64[] = [];

    //received_non_full_blocks.forEach((it, keys) => {
    //    if (Date.now() - itsecond.second > ASK_FOR_FULL_BLOCKS_INDIVIDUAL_EACH_MILLISECONDS) {

    //        it.second = make_pair(it -> second.first, time_of_now);
    //        let bz: Block = find_block_by_hash(blockchains[it.second.first], it -> first);


    //        if (undefined != bz && !(bz.is_full_block))
    //            nfb.push_back(make_pair(it -> first, it -> second.first));
    //        else if (undefined != bz && bz -> is_full_block)
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

function remove_waiting_blocks(time_of_now:number)
{

    let to_remove: Int64[] = [];

    //for (auto it = waiting_for_full_blocks.begin(); it != waiting_for_full_blocks.end(); it++ ) {
    //    if (time_of_now - it -> second > MAX_WAIT_FOR_FULL_BLOCK_MILLSECONDS)
    //        //waiting_for_full_blocks.erase( (it++)->first );
    //        to_remove.push_back(it -> first);
    //}

    for (let i = 0; i < to_remove.length; i++)
        if (waiting_for_full_blocks[to_remove[i]] != waiting_for_full_blocks.values()[waiting_for_full_blocks.size-1])
            waiting_for_full_blocks.delete(to_remove[i]);

}


const STORE_BLOCKS = true;
const BLOCKS_STORE_FREQUENCY = 0;
const FOLDER_BLOCKS = "";
const my_ip = "";
const my_port = "";


let last_confirmbar = -1;
function update_blocks_commited_time() {
    let time_of_now: number = Date.now()

    console.log("update_blocks_commited_time", time_of_now);
    for (let j = 0; j < config.NO_T_DISCARDS; j++) {


        /*
         * Update partial times
         */
        for (let i = 0; i < config.CHAINS; i++) {

            // Discard the last 
            let t: Block = deepest[i];
            let count: number = 0;
            while (undefined != t && count++ < config.T_DISCARD[j])
                t = t.parent;
            if (undefined == t) continue;

            while (undefined != t) {
                if (t.is_full_block && undefined != t.nb && 0 == t.nb.time_partial[j] && time_of_now > t.nb.time_mined) {
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
        for (let i = 0; i < config.CHAINS; i++) {

            // Discard the last 
            let t: Block = deepest[i];

            let count = 0;
            while (undefined != t && count++ < config.T_DISCARD[j]) {
                t = t.parent;
            }
            if (undefined == t) {
                stop_this_j = true;
                break;
                //return;
            }

            if (t.nb == undefined) {
                stop_this_j = true;
                break;
                //return;
            }

            if (stop_this_j) break;

            if (confirm_bar == -1)
                confirm_bar = t.nb.next_rank;
            else if (t.nb.next_rank < confirm_bar) confirm_bar = t.nb.next_rank;
        }
  
        console.log("Get Min confirm_bar: ", confirm_bar, "|stop_this_j: ", stop_this_j, "| last_confirmbar: ", last_confirmbar);

        if (stop_this_j) return;
        if (confirm_bar < 0) return;

        if (confirm_bar > last_confirmbar) {
            console.log("Get Min confirm_bar: ", confirm_bar);

            if (last_confirmbar == -1) {
                if (confirm_bar > 2)
                    confirm_bar = 2;

                last_confirmbar = confirm_bar;
            }
            else {
                if (confirm_bar - last_confirmbar > 2)
                    confirm_bar = last_confirmbar + 2;

                last_confirmbar = confirm_bar
            }
            console.log("Set confirm_bar: ", confirm_bar, "Avoid more than 2");
        }
        // Update commited times
        for (let i = 0; i < config.CHAINS; i++) {

            // Discard the last 
            let t: Block = deepest[i];
            let count = 0;
            while (undefined != t && count++ < config.T_DISCARD[j])
                t = t.parent;
            if (undefined == t) continue;

            while (undefined != t) {
                if (t.is_full_block && undefined != t.nb && t.nb.next_rank < confirm_bar && 0 == t.nb.time_commited[j] && time_of_now > t.nb.time_mined) {
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
    


///////////////////////////////////////////////////////////////////////////////////////////////

const findBlock = (index: number, previousHash: string, timestamp: number, data: Transaction[], difficulty: number): Block => {
    let nonce = 0;
    let chainID = 0;
    let rank = 0;
    let nextRank = 0;
    while (true) {
        const hash: string = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID);
        }
        nonce++;
    }
};

const getAccountBalance = (): number => {
    return getBalance(getPublicFromWallet(), getUnspentTxOuts());
};

const sendTransaction = (address: string, amount: number): Transaction => {
    const tx: Transaction = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
    addToTransactionPool(tx, getUnspentTxOuts());
    broadCastTransactionPool();
    return tx;
};

const calculateHashForBlock = (block: Block): string =>
    calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index: number, previousHash: string, timestamp: number, data: Transaction[],
                       difficulty: number, nonce: number): string =>
    CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

const isValidBlockStructure = (block: Block): boolean => {
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'object';
};

const isValidNewBlock = (newBlock: Block, previousBlock: Block): boolean => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid block structure: %s', JSON.stringify(newBlock));
        return false;
    }
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    } else if (!hasValidHash(newBlock)) {
        return false;
    }
    return true;
};

const getAccumulatedDifficulty = (aBlockchain: Block[]): number => {
    return aBlockchain
        .map((block) => block.difficulty)
        .map((difficulty) => Math.pow(2, difficulty))
        .reduce((a, b) => a + b);
};

const isValidTimestamp = (newBlock: Block, previousBlock: Block): boolean => {
    return ( previousBlock.timestamp - 60 < newBlock.timestamp )
        && newBlock.timestamp - 60 < getCurrentTimestamp();
};

const hasValidHash = (block: Block): boolean => {

    if (!hashMatchesBlockContent(block)) {
        console.log('invalid hash, got:' + block.hash);
        return false;
    }

    if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
    }
    return true;
};

const hashMatchesBlockContent = (block: Block): boolean => {
    const Int64: string = calculateHashForBlock(block);
    return Int64 === block.hash;
};

const hashMatchesDifficulty = (hash: string, difficulty: number): boolean => {
    const hashInBinary: string = hexToBinary(hash);
    const requiredPrefix: string = '0'.repeat(difficulty);
    return hashInBinary.startsWith(requiredPrefix);
};

/*
    Checks if the given blockchain is valid. Return the unspent txOuts if the chain is valid
 */
const isValidChain = (blockchainToValidate: Block[]): UnspentTxOut[] => {
    console.log('isValidChain:');
    console.log(JSON.stringify(blockchainToValidate));
    const isValidGenesis = (block: Block): boolean => {
        //return JSON.stringify(block) === JSON.stringify(genesisBlock);
        return JSON.stringify(block) === JSON.stringify("");
    };

    if (!isValidGenesis(blockchainToValidate[0])) {
        return undefined;
    }
    /*
    Validate each block in the chain. The block is valid if the block structure is valid
      and the transaction are valid
     */
    let aUnspentTxOuts: UnspentTxOut[] = [];

    for (let i = 0; i < blockchainToValidate.length; i++) {
        const currentBlock: Block = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return undefined;
        }

        aUnspentTxOuts = processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === undefined) {
            console.log('invalid transactions in blockchain');
            return undefined;
        }
    }
    return aUnspentTxOuts;
};

const addBlockToChain = (newBlock: Block, chainID = 0): boolean => {
    if (isValidNewBlock(newBlock, getLatestBlock(chainID))) {
        const retVal: UnspentTxOut[] = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (retVal === undefined) {
            console.log('block is not valid in terms of transactions');
            return false;
        } else {
            blockchains.push(newBlock);
            setUnspentTxOuts(retVal);
            updateTransactionPool(unspentTxOuts);
            return true;
        }
    }
    return false;
};

const replaceChain = (newBlocks: Block[], chainID = 0) => {
    const aUnspentTxOuts = isValidChain(newBlocks);
    const validChain: boolean = aUnspentTxOuts !== undefined;
    if (validChain &&
        getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchains = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        updateTransactionPool(unspentTxOuts);
        broadcastLatest();
    } else {
        console.log('Received blockchain invalid');
    }
};

const handleReceivedTransaction = (transaction: Transaction) => {
    addToTransactionPool(transaction, getUnspentTxOuts());
};


const test = () => {
    console.log("Test Start");

    let b: Block = get_deepest_child_by_chain_id(1);
    console.log(b.chainID)


    console.log("Test End");

}

export {
    BlockHash, NetworkBlock, Block, getBlockchain, getUnspentTxOuts, getLatestBlock, sendTransaction,
    handleReceivedTransaction, getMyUnspentTransactionOutputs,
    getAccountBalance, isValidBlockStructure, replaceChain, addBlockToChain,
    getDifficulty, findBlock, test, initBlockChains,
    find_block_by_hash, insert_block_only_by_hash, insert_one_node, insert_subtree_by_hash, add_block_by_parent_hash,
    find_number_of_nodes, remove_one_chain, is_incomplete_hash, is_in_incomplete, find_incomplete_block, add_block_to_incomplete, find_number_of_incomplete_blocks,
    add_subtree_to_received_non_full, find_max_depth, add_received_block, 
    find_block_by_hash_and_chain_id, find_incomplete_block_by_hash_and_chain_id, get_incomplete_chain, get_deepest_child_by_chain_id, have_full_block, still_waiting_for_full_block, add_block_by_parent_hash_and_chain_id,
    get_incomplete_chain_hashes, get_non_full_blocks, remove_waiting_blocks, set_block_full, add_mined_block, update_blocks_commited_time, print_blocks_by_BlockChainID, print_all_incomplete_chains, get_block_by_hash

};
