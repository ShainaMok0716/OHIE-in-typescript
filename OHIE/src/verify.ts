import * as CryptoJS from 'crypto-js';
import config from './Configuration';
import {
    BlockHash
} from './blockchain';

function blockhash_to_string ( b: BlockHash): string
{
	let hash: string = b.toString(16);
	
	//if ( hash.length < 2 * sizeOf(BlockHash) )
	//	hash = string(2 * sizeOf(BlockHash) - hash.length, '0').append( hash );
	let newhash:string = padLeft(hash, '0', 2 * 8);
	
	return newhash;
}

function padLeft(text:string, padChar:string, size:number): string 
{
    return (String(padChar).repeat(size) + text).substr( (size * -1), size);
}

function compute_merkle_tree_root ( leaves: string[] ): string
{
	let tmp: string[] = leaves;
	let next: number = 0;
	while( tmp.length > 1 ){
		let tmp2: string[] = tmp;
		tmp = [];
		for( let i=0; i< tmp2.length/2; i++){
			let st: string = tmp2[2*i+0] + tmp2[2*i+1];
			next += 2;
			tmp.push( CryptoJS.SHA256(st).toString());
		}
	}
	return tmp[0];
}

function compute_merkle_proof( leaves: string[], index: number ): string[]
{
	let first_index: number  = index;

	let proof: string[];
	proof.push( leaves[index] );
	let tmp: string[] = leaves;
	while( tmp.length > 1 ){
		let tmp2: string[] = tmp;
		tmp = [];
		let adj_index: number = (index % 2 ) ? (index -1 ) : (index + 1);
		for( let i=0; i< tmp2.length/2; i++){

			let st: string = tmp2[2*i+0] + tmp2[2*i+1];
			tmp.push( CryptoJS.SHA256(st).toString());

			if ( 2*i+0 == adj_index || 2*i+1 == adj_index  )
				proof.push( (2*i+0 == adj_index) ? tmp2[2*i+0] : tmp2[2*i+1] );
		}
		index /= 2;
	}

	proof.push( tmp[0] );

	return proof;
}


function get_chain_id_from_hash(h: string): number
{
	//return stoi ( h.substr(58) ,nullptr,16) % CHAINS;
	
	return parseInt(h.substring(58), 16) % config.CHAINS;	
}

export {blockhash_to_string,compute_merkle_tree_root,compute_merkle_proof, get_chain_id_from_hash};