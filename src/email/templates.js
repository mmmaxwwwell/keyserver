'use strict';

const util = require('../service/util');

function verifyKey(ctx, {name, email, nonce, origin, keyId}) {
  const link = `<a href="https://${process.env.HOSTED_URL}/api/v1/key?op=verify&keyId=${keyId}&nonce=${nonce}" target="_blank">https://${process.env.HOSTED_URL}/api/v1/key?op=verify&keyId=${keyId}&nonce=${nonce}</a>`;
  return {
    subject: ctx.__('verify_key_subject'),
    text: ctx.__('verify_key_text', [name, email, link, process.env.HOSTED_URL])
  };
}

function verifyRemove(ctx, {name, email, nonce, origin, keyId}) {
  const link = `<a href="https://${process.env.HOSTED_URL}/api/v1/key?op=verifyRemove&keyId=${keyId}&nonce=${nonce}" target="_blank">https://${process.env.HOSTED_URL}/api/v1/key?op=verifyRemove&keyId=${keyId}&nonce=${nonce}</a>`;
  return {
    subject: ctx.__('verify_removal_subject'),
    text: ctx.__('verify_removal_text', [name, email, process.env.HOSTED_URL, link])
  };
}

module.exports = {verifyKey, verifyRemove};
