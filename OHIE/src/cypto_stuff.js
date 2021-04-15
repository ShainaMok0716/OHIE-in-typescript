"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verify_message = exports.sign_message = exports.get_private_key_from_file = exports.sha256 = void 0;
const Configuration_1 = require("./Configuration");
const CryptoJS = require("crypto-js");
const DUMMY_SIGNATURE = "11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
const SHA256_DIGEST_LENGTH = 32;
const elliptic_1 = require("elliptic");
const wallet_1 = require("./wallet");
const EC = new elliptic_1.ec('secp256k1');
function sha256(str) {
    return CryptoJS.SHA256(str);
}
exports.sha256 = sha256;
exports.get_private_key_from_file = () => {
    return wallet_1.getPrivateFromWallet();
};
function sign_message(message) {
    if (!Configuration_1.default.SIGN_TRANSACTIONS || !Configuration_1.default.VERIFY_TRANSACTIONS)
        return DUMMY_SIGNATURE;
    //    if (!VERIFY_TRANSACTIONS) return  dummy_signature ;  
    let h = sha256(message);
    let sig;
    let siglen = exports.get_private_key_from_file().length;
    const key = elliptic_1.ec.keyFromPrivate(exports.get_private_key_from_file(), 'hex');
    const signature = toHexString(key.sign(h).toDER());
    return signature;
}
exports.sign_message = sign_message;
function verify_message(message, signature) {
    return true;
}
exports.verify_message = verify_message;
const toHexString = (byteArray) => {
    return Array.from(byteArray, (byte) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
};
//# sourceMappingURL=cypto_stuff.js.map