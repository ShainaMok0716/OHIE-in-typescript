import * as WebSocket from 'ws';
import {Server} from 'ws';
import {
    addBlockToChain, Block, getBlockchain, getLatestBlock, handleReceivedTransaction, isValidBlockStructure,update_blocks_commited_time, 
    replaceChain, NetworkBlock, BlockHash,
    get_incomplete_chain_hashes, get_non_full_blocks
} from './blockchain';
import {Transaction} from './transaction';
import {getTransactionPool} from './transactionPool';
import {Message, create__ask_block, create__process_block, create__got_full_block, 
    create__have_full_block, create__ask_full_block, create__full_block } from './requests'
import {process_buffer} from './p2p_processor'
import config from './Configuration'
import * as Int64 from 'node-int64';

export enum MessageType {
    QUERY_LATEST = 0,
    QUERY_ALL = 1,
    RESPONSE_BLOCKCHAIN = 2,
    QUERY_TRANSACTION_POOL = 3,
    RESPONSE_TRANSACTION_POOL = 4,
    ask_block = 11,
    process_block = 12,
    got_full_block = 13,
    have_full_block = 14,
    ask_full_block = 15,
    full_block = 16,

}

const sockets: WebSocket[] = [];  

const initP2PServer = (p2pPort: number) => {
    const server: Server = new WebSocket.Server({port: p2pPort});
    server.on('connection', (ws: WebSocket) => {
        initConnection(ws);
    });
    console.log('listening websocket p2p port on: ' + p2pPort);
};

const getSockets = () => sockets;
let updateCommitInterval = null;

const initConnection = (ws: WebSocket) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());

    // query transactions pool only some time after chain query
    setTimeout(() => {
        broadcast(queryTransactionPoolMsg());
    }, 500);


    // Get incomplete chains
    setInterval(()=> { 
        for( let i=0; i<config.CHAINS; i++) {
            const hashes: BlockHash[] = get_incomplete_chain_hashes( i , Date.now() );
            for ( let j=0; j<hashes.length; j++) {
                broadcast(create__ask_block(i, hashes[j], 0, config.MAX_ASK_BLOCKS));
            }
        }     
    }, config.ASK_FOR_INCOMPLETE_EACH_MILLISECONDS);

    // Get full block s
    setInterval(()=> { 
        const blocks: Map<string, number> = get_non_full_blocks( Date.now() );
        blocks.forEach((value: number, key: string) => {
            broadcast(create__got_full_block(key, value));
        }); 
    }, config.ASK_FOR_FULL_BLOCKS_EACH_MILLISECONDS);

    // Update commited 
    updateCommitInterval = setInterval(()=> { update_blocks_commited_time(); }, config.UPDATE_COMMITED_TIME_EACH_MILLISECONDS);
};

export function triggerUpdateCommitInterval  (isOn: boolean) {
    if (isOn)
        updateCommitInterval = setInterval(() => { update_blocks_commited_time(); }, config.UPDATE_COMMITED_TIME_EACH_MILLISECONDS);
    else
        clearInterval(updateCommitInterval);

    return "isOn: " + isOn;
}

export const JSONToObject = <T>(data: string): T => {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.log(e);
        return null;
    }
};

const initMessageHandler = (ws: WebSocket) => {
    ws.on('message', (data: string) => {

        try {
            const message: Message = JSONToObject<Message>(data);
			console.log("message.type:" + message.type);
            if (message === null) {
                console.log('could not parse received JSON message: ' + data);
                return;
            }
            console.log('Received message: %s', JSON.stringify(message));
            switch (message.type) {
                case MessageType.QUERY_LATEST:
                    write(ws, responseLatestMsg());
                    break;
                case MessageType.QUERY_ALL:
                    write(ws, responseChainMsg());
                    break;
                case MessageType.RESPONSE_BLOCKCHAIN:
                    const receivedBlocks: Block[] = JSONToObject<Block[]>(message.data);
                    if (receivedBlocks === null) {
                        console.log('invalid blocks received: %s', JSON.stringify(message.data));
                        break;
                    }
                    handleBlockchainResponse(receivedBlocks);
                    break;
                case MessageType.QUERY_TRANSACTION_POOL:
                    write(ws, responseTransactionPoolMsg());
                    break;
                case MessageType.RESPONSE_TRANSACTION_POOL:
                    const receivedTransactions: Transaction[] = JSONToObject<Transaction[]>(message.data);
                    if (receivedTransactions === null) {
                        console.log('invalid transaction received: %s', JSON.stringify(message.data));
                        break;
                    }
                    receivedTransactions.forEach((transaction: Transaction) => {
                        try {
                            handleReceivedTransaction(transaction);
                            // if no error is thrown, transaction was indeed added to the pool
                            // let's broadcast transaction pool
                            broadCastTransactionPool();
                        } catch (e) {
                            console.log(e.message);
                        }
                    });
                    break;
                case MessageType.ask_block:
                case MessageType.process_block:
                case MessageType.got_full_block:
                case MessageType.have_full_block:
                case MessageType.ask_full_block:
                case MessageType.full_block:
                    process_buffer(ws, message);
                    break;
            }
        } catch (e) {
            console.log(e);
        }
    });
};

const write = (ws: WebSocket, message: Message): void => ws.send(JSON.stringify(message));
export const broadcast = (message: Message): void => sockets.forEach((socket) => write(socket, message));

const queryChainLengthMsg = (): Message => ({'type': MessageType.QUERY_LATEST, 'data': null});

const queryAllMsg = (): Message => ({'type': MessageType.QUERY_ALL, 'data': null});

const responseChainMsg = (): Message => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

const responseLatestMsg = (): Message => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

const queryTransactionPoolMsg = (): Message => ({
    'type': MessageType.QUERY_TRANSACTION_POOL,
    'data': null
});

const responseTransactionPoolMsg = (): Message => ({
    'type': MessageType.RESPONSE_TRANSACTION_POOL,
    'data': JSON.stringify(getTransactionPool())
});

const initErrorHandler = (ws: WebSocket) => {
    const closeConnection = (myWs: WebSocket) => {
        console.log('connection failed to peer: ' + myWs.url);
        sockets.splice(sockets.indexOf(myWs), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

const handleBlockchainResponse = (receivedBlocks: Block[]) => {
    if (receivedBlocks.length === 0) {
        console.log('received block chain size of 0');
        return;
    }
    const latestBlockReceived: Block = receivedBlocks[receivedBlocks.length - 1];
    if (!isValidBlockStructure(latestBlockReceived)) {
        console.log('block structuture not valid');
        return;
    }
    const latestBlockHeld: Block = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: '
            + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            if (addBlockToChain(latestBlockReceived)) {
                broadcast(responseLatestMsg());
            }
        } else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer');
            broadcast(queryAllMsg());
        } else {
            console.log('Received blockchain is longer than current blockchain');
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};

const broadcastLatest = (): void => {
    broadcast(responseLatestMsg());
};

const connectToPeers = (newPeer: string): void => {
    const ws: WebSocket = new WebSocket(newPeer);
    ws.on('open', () => {
        initConnection(ws);
    });
    ws.on('error', () => {
        console.log('connection failed');
    });
};

const broadCastTransactionPool = () => {
    broadcast(responseTransactionPoolMsg());
};

export {connectToPeers, broadcastLatest, broadCastTransactionPool, initP2PServer, getSockets};

export function get_server_folder(){
    return "_Blockchains/_"+sockets[0].url;
}

export function write_to_all_peers(msg){
    broadcast(msg);
}

export function write_to_one_peer(ws, msg){
    write(ws, msg);
}

export function send_block_to_one_peer(ws, b){
    write_to_one_peer(ws, create__process_block(b));
}

export function send_block_to_peers(nb){
    broadcast(create__process_block(nb));
}

let bytes_received = 0;
let bytes_txs_received = 0;
let no_verified_transactions = 0;

export function add_bytes_received( br: number,  mbr: number )
{
  bytes_received += br;
  bytes_txs_received += mbr;
}

export function additional_verified_transaction(add_new: number){
    no_verified_transactions += add_new;
}




