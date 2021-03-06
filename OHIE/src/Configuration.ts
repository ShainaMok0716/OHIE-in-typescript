export default {
	CHAINS: 4,
	MAX_CHAINS: 4,
	NO_T_DISCARDS: 1,
	ASK_FOR_INCOMPLETE_EACH_MILLISECONDS: 50,
	ASK_FOR_INCOMPLETE_INDIVIDUAL_MILLISECONDS: 60,
	ASK_FOR_FULL_BLOCKS_EACH_MILLISECONDS: 200,
	ASK_FOR_FULL_BLOCKS_INDIVIDUAL_EACH_MILLISECONDS: 550,
	UPDATE_COMMITED_TIME_EACH_MILLISECONDS: 10000,
	MAX_WAIT_FOR_FULL_BLOCK_MILLSECONDS: 1000,
	MAX_ASK_NON_FULL_IN_ONE_GO: 250,
	MAX_ASK_BLOCKS: 4,
	NO_ASKS_BEFORE_REMOVING: 600,
	T_DISCARD: [6,6,6,6],
	PRINT_MINING_MESSAGES: 0,
	 // Cease all mining after mining MAX_MINE_BLOCKS blocks
	MAX_MINE_BLOCKS: 300000,
	BLOCK_SIZE_IN_BYTES: ( 4 * 8 * 1024),
	EMPTY_LEAF: "00000000000000000000000000000000",

	WRITE_BLOCKS_TO_HDD: false,
	fake_transactions: true,

	// Sing + verify transactions
	SIGN_TRANSACTIONS: 0,
	VERIFY_TRANSACTIONS: 0,
	ADDRESS_SIZE_IN_DWORDS: 5,
};