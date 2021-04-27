/////////////////////////////////////
Run in Windows10 cmd
////////////////////////////////////

Server side:
npm start

input ports setting
httpPort? 3001
p2pPort? 6001

//After init blockchains, each blockchain has a dummy block for first block.
Chain ID: 0
 Hash: 0 Depth: 0 Rank: 0  NextRank: 1  | time_partial: [ 1 ]  | time_commited: [ 1 ]
Chain ID: 1
 Hash: 1 Depth: 0 Rank: 0  NextRank: 1  | time_partial: [ 1 ]  | time_commited: [ 1 ]
Chain ID: 2
 Hash: 2 Depth: 0 Rank: 0  NextRank: 1  | time_partial: [ 1 ]  | time_commited: [ 1 ]
Chain ID: 3
 Hash: 3 Depth: 0 Rank: 0  NextRank: 1  | time_partial: [ 1 ]  | time_commited: [ 1 ]

////////////////////////////////////////////////////////////////
Client side:
//server side print all blocks in blockchains
curl http://localhost:3001/printBlocks 

//Add peer between 3001, 6001
// After peer success, update_blocks_commited_time would be start loop interval
curl -H "Content-type:application/json" --data "{\"peer\" : \"ws://localhost:6002\"}" http://localhost:3001/addPeer

//Start Mine, would get return chainids for newblocks
//times means mine times
curl -H "Content-type:application/json" --data "{\"times\" : 100}" http://localhost:3001/start_mine

//Print block by hash (XXXXXX is target block's hash)
curl -H "Content-type:application/json" --data "{\"hash\" : \"0ce0293015d0a8a971883420074124a69bd65f5a64c00894ad8385f5ab19d533\"}" http://localhost:3001/print_block_by_hash

