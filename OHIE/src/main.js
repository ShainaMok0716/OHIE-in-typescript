"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bodyParser = require("body-parser");
const express = require("express");
const _ = require("lodash");
const blockchain_1 = require("./blockchain");
const miner_1 = require("./miner");
const p2p_1 = require("./p2p");
const transactionPool_1 = require("./transactionPool");
const wallet_1 = require("./wallet");
let httpPort = parseInt(process.env.HTTP_PORT) || 3001;
let p2pPort = parseInt(process.env.P2P_PORT) || 6001;
const initHttpServer = (myHttpPort) => {
    const app = express();
    app.use(bodyParser.json());
    app.use((err, req, res, next) => {
        if (err) {
            res.status(400).send(err.message);
        }
    });
    app.get('/blocks', (req, res) => {
        res.send(blockchain_1.getBlockchain());
    });
    app.get('/test', (req, res) => {
        blockchain_1.test();
    });
    app.get('/block/:hash', (req, res) => {
        const block = _.find(blockchain_1.getBlockchain(), { 'hash': req.params.hash });
        res.send(block);
    });
    app.get('/transaction/:id', (req, res) => {
        const tx = _(blockchain_1.getBlockchain())
            .map((blocks) => blocks.data)
            .flatten()
            .find({ 'id': req.params.id });
        res.send(tx);
    });
    app.get('/address/:address', (req, res) => {
        const unspentTxOuts = _.filter(blockchain_1.getUnspentTxOuts(), (uTxO) => uTxO.address === req.params.address);
        res.send({ 'unspentTxOuts': unspentTxOuts });
    });
    app.get('/unspentTransactionOutputs', (req, res) => {
        res.send(blockchain_1.getUnspentTxOuts());
    });
    app.get('/myUnspentTransactionOutputs', (req, res) => {
        res.send(blockchain_1.getMyUnspentTransactionOutputs());
    });
    app.post('/mineRawBlock', (req, res) => {
        if (req.body.data == null) {
            res.send('data parameter is missing');
            return;
        }
        const newBlock = miner_1.generateRawNextBlock(req.body.data);
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        }
        else {
            res.send(newBlock);
        }
    });
    app.post('/mineBlock', (req, res) => {
        const newBlock = miner_1.generateNextBlock();
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        }
        else {
            res.send(newBlock);
        }
    });
    app.post('/start_mine', (req, res) => {
        console.log("Request to mine ", req.body.times);
        let returnStr = "";
        for (let i = 0; i < req.body.times; i++) {
            setTimeout(function () {
                const newBlockChainID = miner_1.mine_new_block(null);
                if (newBlockChainID === null) {
                    res.status(400).send('could not generate block');
                }
                else {
                    returnStr += newBlockChainID.toString() + "|";
                }
            }, 10 * i);
        }
        setTimeout(function () {
            res.send(returnStr);
        }, 10 * req.body.times + 1);
    });
    app.get('/balance', (req, res) => {
        const balance = blockchain_1.getAccountBalance();
        res.send({ 'balance': balance });
    });
    app.get('/address', (req, res) => {
        const address = wallet_1.getPublicFromWallet();
        res.send({ 'address': address });
    });
    app.post('/mineTransaction', (req, res) => {
        const address = req.body.address;
        const amount = req.body.amount;
        try {
            const resp = miner_1.generatenextBlockWithTransaction(address, amount);
            res.send(resp);
        }
        catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });
    app.post('/sendTransaction', (req, res) => {
        try {
            const address = req.body.address;
            const amount = req.body.amount;
            if (address === undefined || amount === undefined) {
                throw Error('invalid address or amount');
            }
            const resp = blockchain_1.sendTransaction(address, amount);
            res.send(resp);
        }
        catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });
    app.get('/transactionPool', (req, res) => {
        res.send(transactionPool_1.getTransactionPool());
    });
    app.get('/peers', (req, res) => {
        res.send(p2p_1.getSockets().map((s) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        p2p_1.connectToPeers(req.body.peer);
        res.send();
    });
    app.post('/stop', (req, res) => {
        res.send({ 'msg': 'stopping server' });
        process.exit();
    });
    app.listen(myHttpPort, () => {
        console.log('Listening http on port: ' + myHttpPort);
    });
    app.get('/printBlocks', (req, res) => {
        res.send(blockchain_1.print_blocks_by_BlockChainID());
    });
    app.get('/printIncompleteBlocks', (req, res) => {
        res.send(blockchain_1.print_blocks_by_BlockChainID());
    });
    app.get('/offCommintTime', (req, res) => {
        res.send(p2p_1.triggerUpdateCommitInterval(false));
    });
    app.get('/onCommintTime', (req, res) => {
        res.send(p2p_1.triggerUpdateCommitInterval(true));
    });
};
function startTest() {
    var readline = require('readline');
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("httpPort? ", function (answer) {
        httpPort = answer;
        rl.question("p2pPort? ", function (answer) {
            p2pPort = answer;
            rl.close();
            //finish port setting
            blockchain_1.initBlockChains();
            initHttpServer(httpPort);
            p2p_1.initP2PServer(p2pPort);
            wallet_1.initWallet();
        });
    });
    return false;
}
startTest();
//# sourceMappingURL=main.js.map