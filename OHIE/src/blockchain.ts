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
import { networkBlock, Block, incompleteBlock} from './block';


//initial setting
const MAX_CHAINS = 4;
const NO_T_DISCARDS = 1;
const ASK_FOR_INCOMPLETE_EACH_MILLISECONDS = 50;
const ASK_FOR_INCOMPLETE_INDIVIDUAL_MILLISECONDS = 60;
const ASK_FOR_FULL_BLOCKS_EACH_MILLISECONDS = 200;
const ASK_FOR_FULL_BLOCKS_INDIVIDUAL_EACH_MILLISECONDS = 550;
const MAX_WAIT_FOR_FULL_BLOCK_MILLSECONDS = 1000;
const MAX_ASK_NON_FULL_IN_ONE_GO = 250;
const NO_ASKS_BEFORE_REMOVING = 600;
// 4 chains
let blockchains: Block[];
let inBlockchains: incompleteBlock[];
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

    for (let i = 0; i < MAX_CHAINS; i++) {
        let initHash: Int64 = i;
        let newBlock = bootstrap_chain(initHash);
        newBlock.is_full_block = false;
        newBlock.nb = new networkBlock();
        newBlock.nb.depth = 0;
        newBlock.rank = 0;
        newBlock.nextRank = 0;
        newBlock.nb.time_mined = 0;
        newBlock.nb.time_received = 0;
        newBlock.chainID = i;
        newBlock.nb.time_commited = [];
        newBlock.nb.time_partial = [];

        for (let j = 0; j < NO_T_DISCARDS; j++) {
            newBlock.nb .time_commited.push( 1);
            newBlock.nb. time_partial.push(1);
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
    for (let j = 0; j < NO_T_DISCARDS; j++) {
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

    let b: Block = new Block(0, "", "", 0, [genesisTransaction], 0, 0, 0, 0, 0);
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

function find_block_by_hash (b:Block, hash: Int64): Block 
{

    if (null == b) return null;

    if (b.hash > hash) return find_block_by_hash(b.left, hash);
    else if (b.hash < hash) return find_block_by_hash(b.right, hash);

    return b;
} 

function insert_block_only_by_hash(r: Block, hash: Int64, newnode: Block): { r:Block, newnode:Block}
{
    if (null == r) {
        let t: Block = new Block(0, "", "", 0, [], 0, 0, 0, 0, 0);
        t.hash = hash;
        t. is_full_block = false;
        t.left = t.right = t.child = t.sibling = t.parent = null;
        newnode = t;
        return { r:t, newnode };
    }

    if (r.hash >= hash) r.left = insert_block_only_by_hash(r.left, hash, newnode).r;
    else if (r.hash < hash) r.right = insert_block_only_by_hash(r.right, hash, newnode).r;

    return { r, newnode };
}

function insert_one_node(r: Block, subtree: Block) {
    if (null == r) return subtree;
    if (null == subtree) return r;

    if (r.hash > subtree.hash) {
        if (r.left == null) {
            r.left = subtree;
        }
        else
            r.left = insert_one_node(r.left, subtree);
    }
    else if (r.hash < subtree. hash) {
        if (r.right == null) {
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
    if (null == subtree) return r;

    let left = subtree.left;
    let right = subtree.right;

    subtree.left = subtree.right = null;
    r = insert_one_node(r, subtree);

    r = insert_subtree_by_hash(r, left);
    r = insert_subtree_by_hash(r, right);

    return r;
}

function add_block_by_parent_hash( root:Block, parent: Int64, hash: Int64): boolean
{
    // Find the parent block node by parent's Int64
    let p: Block = find_block_by_hash( root, parent);
    if (null == p) {
        console.log("Cannot find parent for ");
        return false;
    }
    // Insert the new node (of the child)
    const { r, newnode } = insert_block_only_by_hash(root, hash, null);

    if (null == newnode) {
        console.log( "Something is wrong, new node is null in 'add_child' ")
        return false;
    }

    // Set the parent of the new node
    newnode. parent = p;

    // Set the new node as one of parents children
    if (null == p. child) {
        p .child = newnode;
    }
    else {
       let z:Block = p. child;
        while (z .sibling != null) z = z .sibling;
        z.sibling = newnode;
    }

    return true;
}

function find_number_of_nodes(r: Block):number
{
    if (null == r) return 0;

    let n = 0;
    let c:Block = r. child;
    while (null != c) {
        n += find_number_of_nodes(c);
        c = c.sibling;
    }

    return 1 + n;
}

//Incomplete Part
function remove_one_chain(l: incompleteBlock, to_be_removed: incompleteBlock): incompleteBlock {
    if (null == l)
        return null;

    if (l == to_be_removed) {
        let t: incompleteBlock = l .next;
        return t;
    }
    else {
        let t: incompleteBlock = l;
        while (null != t && t .next != to_be_removed)
            t = t . next;

        if (t. next == to_be_removed) {
            t. next = t.next.next;
        }

        return l;
    }
}

function is_incomplete_hash(l: incompleteBlock, hash: Int64) {
    if (null == l) return null;

    let t: incompleteBlock = l;
    while (null != l && l. b .hash != hash)
        l = l .next;

    if (null != l && null != l. b && l. b. hash == hash)
        return l;

    return null;
}

function is_in_incomplete(l: incompleteBlock, parent_hash: Int64, child_hash: Int64): boolean {
    if (null == l) return false;

    let t: incompleteBlock = l;
    while (null != t) {
        let b:Block = find_block_by_hash(t.b, child_hash);
        if (null != b && b.parent != null && b. parent. hash == parent_hash)
            return true;
        t = t.next;
    }

    return false;
}

function find_incomplete_block(l: incompleteBlock, child_hash:Int64):Block
{

    if (null == l) return null;

    let t: incompleteBlock = l;
    while (null != t) {
        let b:Block = find_block_by_hash(t.b, child_hash);
        if (null != b)
            return b;
        t = t. next;
    }

    return null;
}

function add_block_to_incomplete(l: incompleteBlock, parent_hash: Int64, child_hash: Int64)
{

    if (null == l) {

        let bl:Block = null;
        bl = bootstrap_chain(parent_hash);
        add_block_by_parent_hash( bl, parent_hash, child_hash);

        let bi: incompleteBlock = new incompleteBlock();
        bi.b = bl;
        bi.next = null;
        bi.last_asked = 0;
        bi.no_asks = 0;
        return bi;
    }

    let tmp: incompleteBlock = l, penultimate: incompleteBlock;
    let ch: incompleteBlock, ph: incompleteBlock= null;
    while (null != tmp) {

        if (null == ch) ch = (find_block_by_hash(tmp. b, child_hash) != null) ? tmp : null;
        if (null == ph) ph = (find_block_by_hash(tmp.b, parent_hash) != null) ? tmp : null;

        penultimate = tmp;
        tmp = tmp.next;
    }

    // Neither parent nor child hash has been found
    if (null == ch && null == ph) {
        let bl:Block = null;
        bl = bootstrap_chain(parent_hash);
        add_block_by_parent_hash( bl, parent_hash, child_hash);

        let bi: incompleteBlock = new incompleteBlock();
        bi.b = bl;
        bi.next = null;
        bi.last_asked = 0;
        bi.no_asks = 0;
        penultimate.next = bi;
    }
    else if (null == ch) {

        add_block_by_parent_hash( ph .b, parent_hash, child_hash);
    }
    else if (null == ph) {

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
        if (null == tmp)
            parent_block.child = Ztmp;
		else {
            while (tmp.sibling != null)
                tmp = tmp .sibling;
            tmp. sibling = Ztmp;
        }

        l = remove_one_chain(l, ch);
    }
    return l;
}

function find_number_of_incomplete_blocks(l: incompleteBlock): number
{
    if (null == l) return 0;

    let no = 0;
    while (null != l) {
        no += find_number_of_nodes(l . b);
        l = l . next;
    }

    return no;
}

//print fuinction

function  print_blocks( root:Block)
{
    if (null == root) return;

    print_blocks(root.left);
    console.log("%8lx : %4d : %8lx : %d %d %d %d %d :  %d \n", root.hash, root.nb.depth, (root.parent == null) ? 0 : root.parent.hash,
        root.left != null, root.right != null, root.child != null, root.parent != null, root.sibling != null, root.nb.depth);
    print_blocks(root .right);
}

function  print_full_tree( root:Block)
{
    if (null == root) return;

    console.log(" << hex <<" + root.hash + " << dec << (" + root.nb.depth + ") <<   :  ");
    let t: Block = root. child;
    while (null != t) {
        console.log(" << hex <<" +  t.hash  + "<< ");
        t = t .sibling;
    }

    t = root.child;
    while (null != t) {
        if (t .child != null)
            print_full_tree(t);
        t = t.sibling;
    }

}

function print_all_incomplete_chains(l: incompleteBlock) {
    if (null == l) return;

    print_full_tree(l.b);
    print_all_incomplete_chains(l.next);

}

function print_hash_tree(root: Block) {
    if (null == root) return;

    print_hash_tree(root.left);
    console.log("Z: %lx\n", root.hash);
    print_hash_tree(root. right);
}

///////////////////////////////////////

/*
 * Add the block to the main/incomplete chain
 * Return true if the parent hash is not in any of the main/incomplete chains
 */
const add_received_block = (chain_id: number, parent: Int64, hash: Int64, nb: networkBlock): boolean =>
{

    let added = false;


    // If block is already in the chain, then do nothing
    if (find_block_by_hash(blockchains[chain_id], hash) != null) return false;

    added = true;


    // If parent hash is already in the tree, then just add the child
    if (find_block_by_hash(blockchains[chain_id], parent) != null) {


        // Check if child hash is in incompletes
        let bi: incompleteBlock = is_incomplete_hash(inBlockchains[chain_id], hash);

        if (bi != null) {


            let parent_block: Block = find_block_by_hash(blockchains[chain_id], parent);
            let child_block:Block = bi.b;
            blockchains[chain_id] = insert_subtree_by_hash(blockchains[chain_id], child_block);

            add_subtree_to_received_non_full(child_block, chain_id);


            child_block.parent = parent_block;
            let tmp:Block = parent_block. child;
            if (null == tmp)
                parent_block . child = child_block;
			else {
                while (tmp. sibling != null)
                    tmp = tmp .sibling;
                tmp.sibling = child_block;
            }


            inBlockchains[chain_id] = remove_one_chain(inBlockchains[chain_id], bi);


        }
        else {
            // Just add the (parent, hash)
            add_block_by_parent_hash( blockchains[chain_id], parent, hash);

            // Add to the non-full-blocks
            if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size-1] && !have_full_block(chain_id, hash)) {
                //   received_non_full_blocks.push(make_pair(hash, make_pair(chain_id, 0)));
                received_non_full_blocks[hash] = chain_id;
                total_received_blocks++;
            }

        }


        // Add full block info
        let bz: Block = find_block_by_hash(blockchains[chain_id], hash);
        if (null != bz) {
            bz.nb = new networkBlock();
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
            return false;
        }

        // Add this to incomplete chain
        inBlockchains[chain_id] = add_block_to_incomplete(inBlockchains[chain_id], parent, hash);


        let bz:Block = find_incomplete_block(inBlockchains[chain_id], hash);
        if (null != bz) {
            bz.nb = new networkBlock();
        }



        // Ask for parent hash
        return true;

    }

    return false;

}

function add_subtree_to_received_non_full(b: Block, chain_id: number) {
    if (null == b) return;

    let hash: Int64 = b.hash;
    if (received_non_full_blocks[hash] == received_non_full_blocks.values()[received_non_full_blocks.size - 1] && !have_full_block(chain_id, hash)) {
        received_non_full_blocks[hash] = chain_id;
        total_received_blocks++;
    }

    let c: Block = b.child;
    while (null != c) {
        add_subtree_to_received_non_full(c, chain_id);
        c = c.sibling;
    }
}

function find_max_depth( r:Block) {
    if (null == r) return null;

    let mx:Block = r;
    let tmp:Block = r. child;
    while (null != tmp) {
        let fm:Block = find_max_depth(tmp);
        if (null != fm && fm. nb.depth >mx .nb .depth)
            mx = fm;
        tmp = tmp. sibling;
    }

    return mx;

}

function have_full_block(chain_id: number, hash: Int64): boolean
{
    let bz: Block = find_block_by_hash(blockchains[chain_id], hash);
    if (null != bz && bz. is_full_block) return true;
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



function get_incomplete_chain(chain_id: number): incompleteBlock
{
    return inBlockchains[chain_id];
}



function get_deepest_child_by_chain_id( chain_id:number)
{
    if (null == deepest[chain_id]) {
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


function add_block_by_parent_hash_and_chain_id(parent_hash: Int64, new_block: Int64, chain_id: number, nb: networkBlock)
{
    add_block_by_parent_hash(blockchains[chain_id], parent_hash, new_block);

    let bz: Block = find_block_by_hash(blockchains[chain_id], new_block);
    if (null != bz) {
        this.deepest[chain_id] = bz;
        bz.nb = new networkBlock();
    }

}


function get_incomplete_chain_hashes(chain_id: number, time_of_now:number): Int64[]
{
    let hashes: Int64[] = [];
    let t: incompleteBlock = inBlockchains[chain_id];
    while (null != t) {
        let nextt: incompleteBlock = t.next;
        if (time_of_now - t.last_asked > ASK_FOR_INCOMPLETE_INDIVIDUAL_MILLISECONDS) {
            t.last_asked = time_of_now;
            t.no_asks++;
            if (t.no_asks > NO_ASKS_BEFORE_REMOVING)
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

function  add_mined_block()
{
    mined_blocks++;
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
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce, chainID,rank, nextRank);
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
        return null;
    }
    /*
    Validate each block in the chain. The block is valid if the block structure is valid
      and the transaction are valid
     */
    let aUnspentTxOuts: UnspentTxOut[] = [];

    for (let i = 0; i < blockchainToValidate.length; i++) {
        const currentBlock: Block = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }

        aUnspentTxOuts = processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === null) {
            console.log('invalid transactions in blockchain');
            return null;
        }
    }
    return aUnspentTxOuts;
};

const addBlockToChain = (newBlock: Block, chainID = 0): boolean => {
    if (isValidNewBlock(newBlock, getLatestBlock(chainID))) {
        const retVal: UnspentTxOut[] = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (retVal === null) {
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
    const validChain: boolean = aUnspentTxOuts !== null;
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
    Block, getBlockchain, getUnspentTxOuts, getLatestBlock, sendTransaction,
    handleReceivedTransaction, getMyUnspentTransactionOutputs,
    getAccountBalance, isValidBlockStructure, replaceChain, addBlockToChain,
    getDifficulty, findBlock, test, initBlockChains
};
