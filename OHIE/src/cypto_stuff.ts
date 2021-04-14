import config from './Configuration';
import * as CryptoJS from 'crypto-js';

const DUMMY_SIGNATURE = "11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"
const SHA256_DIGEST_LENGTH = 32;

import * as ecdsa from 'elliptic';
import {ec} from 'elliptic';
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'fs';
import * as _ from 'lodash';

import {getPrivateFromWallet} from './wallet';

const EC = new ec('secp256k1');

export function sha256(str: string){
    return CryptoJS.SHA256(str);
}


export const get_private_key_from_file= (): string => {
    return getPrivateFromWallet();
}


export function sign_message(message: string)
{
    if( !config.SIGN_TRANSACTIONS || !config.VERIFY_TRANSACTIONS ) return DUMMY_SIGNATURE;
//    if (!VERIFY_TRANSACTIONS) return  dummy_signature ;  

    let h = sha256( message );

    let sig;
    let siglen = get_private_key_from_file().length;


    const key = ec.keyFromPrivate(get_private_key_from_file(), 'hex');
    const signature: string = toHexString(key.sign(h).toDER());

    return signature;
}

export function verify_message(message: string, signature: string)
{
    return true;
}

const toHexString = (byteArray): string => {
    return Array.from(byteArray, (byte: any) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
};