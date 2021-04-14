"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ask_block_from_peers = exports.send_block_to_peers = exports.create_transaction_block = exports.getSockets = exports.initP2PServer = exports.broadCastTransactionPool = exports.broadcastLatest = exports.connectToPeers = exports.create__process_block = exports.broadcast = void 0;
const WebSocket = require("ws");
const blockchain_1 = require("./blockchain");
const transactionPool_1 = require("./transactionPool");
const p2p_processor_1 = require("./p2p_processor");
const sockets = [];
var MessageType;
(function (MessageType) {
    MessageType[MessageType["QUERY_LATEST"] = 0] = "QUERY_LATEST";
    MessageType[MessageType["QUERY_ALL"] = 1] = "QUERY_ALL";
    MessageType[MessageType["RESPONSE_BLOCKCHAIN"] = 2] = "RESPONSE_BLOCKCHAIN";
    MessageType[MessageType["QUERY_TRANSACTION_POOL"] = 3] = "QUERY_TRANSACTION_POOL";
    MessageType[MessageType["RESPONSE_TRANSACTION_POOL"] = 4] = "RESPONSE_TRANSACTION_POOL";
    MessageType[MessageType["ASK_BLOCK"] = 5] = "ASK_BLOCK";
})(MessageType || (MessageType = {}));
class Message {
}
const initP2PServer = (p2pPort) => {
    const server = new WebSocket.Server({ port: p2pPort });
    server.on('connection', (ws) => {
        initConnection(ws);
    });
    console.log('listening websocket p2p port on: ' + p2pPort);
};
exports.initP2PServer = initP2PServer;
const getSockets = () => sockets;
exports.getSockets = getSockets;
const initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
    // query transactions pool only some time after chain query
    setTimeout(() => {
        exports.broadcast(queryTransactionPoolMsg());
    }, 500);
};
const JSONToObject = (data) => {
    try {
        return JSON.parse(data);
    }
    catch (e) {
        console.log(e);
        return null;
    }
};
const initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        try {
            const message = JSONToObject(data);
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
                    const receivedBlocks = JSONToObject(message.data);
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
                    const receivedTransactions = JSONToObject(message.data);
                    if (receivedTransactions === null) {
                        console.log('invalid transaction received: %s', JSON.stringify(message.data));
                        break;
                    }
                    receivedTransactions.forEach((transaction) => {
                        try {
                            blockchain_1.handleReceivedTransaction(transaction);
                            // if no error is thrown, transaction was indeed added to the pool
                            // let's broadcast transaction pool
                            broadCastTransactionPool();
                        }
                        catch (e) {
                            console.log(e.message);
                        }
                    });
                    break;
                case MessageType.ASK_BLOCK:
                    p2p_processor_1.handle_ask_block(message.data);
                    break;
            }
        }
        catch (e) {
            console.log(e);
        }
    });
};
const write = (ws, message) => ws.send(JSON.stringify(message));
exports.broadcast = (message) => sockets.forEach((socket) => write(socket, message));
const queryChainLengthMsg = () => ({ 'type': MessageType.QUERY_LATEST, 'data': null });
const queryAllMsg = () => ({ 'type': MessageType.QUERY_ALL, 'data': null });
const queryBlock = (nb) => ({ 'type': MessageType.ASK_BLOCK, 'data': JSON.stringify(nb) });
const responseChainMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain_1.getBlockchain())
});
const responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([blockchain_1.getLatestBlock()])
});
const queryTransactionPoolMsg = () => ({
    'type': MessageType.QUERY_TRANSACTION_POOL,
    'data': null
});
const responseTransactionPoolMsg = () => ({
    'type': MessageType.RESPONSE_TRANSACTION_POOL,
    'data': JSON.stringify(transactionPool_1.getTransactionPool())
});
// REQUESTS IS MOVED HERE
exports.create__process_block = (nb) => ({ 'type': MessageType.ASK_BLOCK, 'data': JSON.stringify(nb) });
const initErrorHandler = (ws) => {
    const closeConnection = (myWs) => {
        console.log('connection failed to peer: ' + myWs.url);
        sockets.splice(sockets.indexOf(myWs), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};
const handleBlockchainResponse = (receivedBlocks) => {
    if (receivedBlocks.length === 0) {
        console.log('received block chain size of 0');
        return;
    }
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    if (!blockchain_1.isValidBlockStructure(latestBlockReceived)) {
        console.log('block structuture not valid');
        return;
    }
    const latestBlockHeld = blockchain_1.getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: '
            + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            if (blockchain_1.addBlockToChain(latestBlockReceived)) {
                exports.broadcast(responseLatestMsg());
            }
        }
        else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer');
            exports.broadcast(queryAllMsg());
        }
        else {
            console.log('Received blockchain is longer than current blockchain');
            blockchain_1.replaceChain(receivedBlocks);
        }
    }
    else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};
const broadcastLatest = () => {
    exports.broadcast(responseLatestMsg());
};
exports.broadcastLatest = broadcastLatest;
const connectToPeers = (newPeer) => {
    const ws = new WebSocket(newPeer);
    ws.on('open', () => {
        initConnection(ws);
    });
    ws.on('error', () => {
        console.log('connection failed');
    });
};
exports.connectToPeers = connectToPeers;
const broadCastTransactionPool = () => {
    exports.broadcast(responseTransactionPoolMsg());
};
exports.broadCastTransactionPool = broadCastTransactionPool;
function create_transaction_block() {
}
exports.create_transaction_block = create_transaction_block;
function send_block_to_peers(nb) {
    //let msg = 
}
exports.send_block_to_peers = send_block_to_peers;
function ask_block_from_peers(nb) {
    exports.broadcast(queryBlock(nb));
}
exports.ask_block_from_peers = ask_block_from_peers;
function write_to_all_peers(msg) {
    exports.broadcast(msg);
}
function write_to_one_peer(ws, msg) {
    write(ws, msg);
}
//# sourceMappingURL=p2p.js.map