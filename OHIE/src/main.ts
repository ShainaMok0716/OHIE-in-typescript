import * as  bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import {
    Block, getAccountBalance,
    getBlockchain, getMyUnspentTransactionOutputs, getUnspentTxOuts, sendTransaction, test, initBlockChains, print_blocks_by_BlockChainID, find_block_by_hash, get_block_by_hash
} from './blockchain';
import {
    generateNextBlock, generatenextBlockWithTransaction, generateRawNextBlock, mine_new_block
} from './miner';
import { connectToPeers, getSockets, initP2PServer, triggerUpdateCommitInterval} from './p2p';
import {UnspentTxOut} from './transaction';
import {getTransactionPool} from './transactionPool';
import {getPublicFromWallet, initWallet} from './wallet';
import { log } from 'util';
import config from './Configuration'

let httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
let p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (myHttpPort: number) => {
    const app = express();
    app.use(bodyParser.json());

    app.use((err, req, res, next) => {
        if (err) {
            res.status(400).send(err.message);
        }
    });

    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });

    app.get('/test', (req, res) => {
        test();
    });

    app.get('/block/:hash', (req, res) => {

            const block = _.find(getBlockchain(), { 'hash': req.params.hash });
            res.send(block);
    });

    app.get('/transaction/:id', (req, res) => {
        const tx = _(getBlockchain())
            .map((blocks) => blocks.data)
            .flatten()
            .find({'id': req.params.id});
        res.send(tx);
    });

    app.get('/address/:address', (req, res) => {
        const unspentTxOuts: UnspentTxOut[] =
            _.filter(getUnspentTxOuts(), (uTxO) => uTxO.address === req.params.address);
        res.send({'unspentTxOuts': unspentTxOuts});
    });

    app.get('/unspentTransactionOutputs', (req, res) => {
        res.send(getUnspentTxOuts());
    });

    app.get('/myUnspentTransactionOutputs', (req, res) => {
        res.send(getMyUnspentTransactionOutputs());
    });

    app.post('/mineRawBlock', (req, res) => {
        if (req.body.data == null) {
            res.send('data parameter is missing');
            return;
        }
        const newBlock: Block = generateRawNextBlock(req.body.data);
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });

    app.post('/mineBlock', (req, res) => {
        const newBlock: Block = generateNextBlock();
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });

    app.post('/print_block_by_hash', (req, res) => {
        console.log("Request to print blocks by hash ", req.body.hash);
        const targetBlock: Block = get_block_by_hash(req.body.hash);
        res.send({ 'target ChainID': targetBlock.chainID });
    });

    app.post('/start_mine', (req, res) => {
     
        console.log("Request to mine ", req.body.times);
        let returnStr = "";
        for (let i = 0; i < req.body.times; i++) {
            setTimeout(function () {
                const newBlockChainID = mine_new_block(null);
                if (newBlockChainID === null) {
                    res.status(400).send('could not generate block');
                } else {
                    returnStr += newBlockChainID.toString() + "|"
                }

            }, 1000*i);
        }

        setTimeout(function () {
            res.send(returnStr);
        }, 1000 * req.body.times + 1);

    });

    app.get('/balance', (req, res) => {
        const balance: number = getAccountBalance();
        res.send({'balance': balance});
    });

    app.get('/address', (req, res) => {
        const address: string = getPublicFromWallet();
        res.send({'address': address});
    });

    app.post('/mineTransaction', (req, res) => {
        const address = req.body.address;
        const amount = req.body.amount;
        try {
            const resp = generatenextBlockWithTransaction(address, amount);
            res.send(resp);
        } catch (e) {
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
            const resp = sendTransaction(address, amount);
            res.send(resp);
        } catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    app.get('/transactionPool', (req, res) => {
        res.send(getTransactionPool());
    });

    app.get('/peers', (req, res) => {
        res.send(getSockets().map((s: any) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers(req.body.peer);
        res.send();
    });

    app.post('/stop', (req, res) => {
        res.send({'msg' : 'stopping server'});
        process.exit();
    });

    app.listen(myHttpPort, () => {
        console.log('Listening http on port: ' + myHttpPort);
    });

    app.get('/printBlocks', (req, res) => {
        res.send(print_blocks_by_BlockChainID());
    });


    app.get('/printIncompleteBlocks', (req, res) => {
        res.send(print_blocks_by_BlockChainID());
    });

    app.get('/offCommintTime', (req, res) => {
        res.send(triggerUpdateCommitInterval(false));
    });

    app.get('/onCommintTime', (req, res) => {
        res.send(triggerUpdateCommitInterval(true));
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
            initBlockChains();
            initHttpServer(httpPort);
            initP2PServer(p2pPort);
            initWallet();

        });
    });

    return false;
}

startTest();
