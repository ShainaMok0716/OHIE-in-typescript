import * as CryptoJS from 'crypto-js';
import config from './Configuration';
import {
    BlockHash
} from './blockchain';

function blockhash_to_string ( b: BlockHash): string
{
	/*
	console.log("Before ---------->" + b);
	let hash: string = b.toString(16);
	console.log("After ---------->" + hash);
		
	//if ( hash.length < 2 * sizeOf(BlockHash) )
	//	hash = string(2 * sizeOf(BlockHash) - hash.length, '0').append( hash );
	let newhash:string = padLeft(hash, '0', 64);
	
	return newhash;
	*/
	return "";
}

function padLeft(text:string, padChar:string, size:number): string 
{
    return (String(padChar).repeat(size) + text).substr( (size * -1), size);
}

export function string_to_blockhash( h: string ){

	//return stoull( h.substr(0, 2*sizeof(BlockHash)), nullptr, 16);
	//return parseInt(h.substring(0, 4 * 8),16);
	return parseInt( h , 16 );
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

	let proof: string[] = [];
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

export function verify_merkle_proof( proof:string[] ,  bh:BlockHash,  root:string, index:number )
{
	//let h: string = blockhash_to_string( bh );
	let h: string = bh;
	if ( proof[0] != h && proof[1] != h)	return false;

	let i: number = 1;
	while( i+1 < proof.length ){

		if ( index % 2) 
			h = CryptoJS.SHA256( proof[i] + h ).toString();
		else 
			h = CryptoJS.SHA256( h + proof[i] ).toString();

		i ++;
		index /= 2;
	}


	if ( proof[i] != h  || root != h ){
		console.log("bad root");
		console.log(proof[i] == h);
		console.log(root==h);
		console.log(proof[i]);
		console.log(h);
		console.log(root)
		return false;
	}


	return true;
}

export {compute_merkle_tree_root,compute_merkle_proof, get_chain_id_from_hash};