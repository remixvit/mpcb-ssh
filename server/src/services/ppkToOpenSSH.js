'use strict';
const crypto = require('crypto');

function writeUint32(val) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(val, 0);
  return buf;
}

function writeString(data) {
  if (typeof data === 'string') data = Buffer.from(data);
  return Buffer.concat([writeUint32(data.length), data]);
}

function readString(buf, offset) {
  const len = buf.readUInt32BE(offset);
  return { value: buf.slice(offset + 4, offset + 4 + len), next: offset + 4 + len };
}

function buildOpenSSHKey(pubKeyWire, privateSection) {
  const checkInt = crypto.randomBytes(4);
  const body = Buffer.concat([checkInt, checkInt, privateSection]);
  const paddingLen = (8 - (body.length % 8)) % 8;
  const padding = Buffer.allocUnsafe(paddingLen);
  for (let i = 0; i < paddingLen; i++) padding[i] = i + 1;

  const keyData = Buffer.concat([
    Buffer.from('openssh-key-v1\0'),
    writeString('none'),       // ciphername
    writeString('none'),       // kdfname
    writeString(''),           // kdfoptions
    writeUint32(1),            // num keys
    writeString(pubKeyWire),   // public key
    writeString(Buffer.concat([body, padding])),  // private section
  ]);

  const b64 = keyData.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

function convertEd25519(pubKeyWire, privBlob) {
  // pubKeyWire: string("ssh-ed25519") + string(32-byte-pubkey)
  const { next: off } = readString(pubKeyWire, 0); // skip algorithm name
  const { value: pubKey } = readString(pubKeyWire, off); // 32-byte pubkey

  // privBlob: string(32-byte-seed)
  const { value: seed } = readString(privBlob, 0);

  const privateSection = Buffer.concat([
    writeString('ssh-ed25519'),
    writeString(pubKey),
    writeString(Buffer.concat([seed, pubKey])), // OpenSSH: seed + pubkey = 64 bytes
    writeString(''), // comment
  ]);

  return buildOpenSSHKey(pubKeyWire, privateSection);
}

function ppkToOpenSSH(ppkContent) {
  const lines = ppkContent.replace(/\r\n/g, '\n').trim().split('\n');
  let i = 0;

  // First line: version + algorithm
  const versionMatch = lines[i++].match(/^PuTTY-User-Key-File-(\d+):\s*(\S+)/);
  if (!versionMatch) throw new Error('Not a PuTTY key file (.ppk)');
  const version = parseInt(versionMatch[1]);
  const algorithm = versionMatch[2];

  if (version > 3) throw new Error(`PPK version ${version} is not supported`);

  // Key-value headers until Public-Lines
  const headers = {};
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Za-z-]+):\s*(.*)/);
    if (!m || m[1] === 'Public-Lines') break;
    headers[m[1]] = m[2];
    i++;
  }

  if (headers['Encryption'] !== 'none') {
    throw new Error('Encrypted PPK keys are not supported. Remove the passphrase in PuTTYgen first (Key → Remove passphrase).');
  }

  // Public key block
  const pubCount = parseInt(lines[i++].match(/^Public-Lines:\s*(\d+)/)[1]);
  let pubBase64 = '';
  for (let j = 0; j < pubCount; j++) pubBase64 += lines[i++];
  const pubKeyWire = Buffer.from(pubBase64, 'base64');

  // Private key block
  const privCount = parseInt(lines[i++].match(/^Private-Lines:\s*(\d+)/)[1]);
  let privBase64 = '';
  for (let j = 0; j < privCount; j++) privBase64 += lines[i++];
  const privBlob = Buffer.from(privBase64, 'base64');

  switch (algorithm) {
    case 'ssh-ed25519': return convertEd25519(pubKeyWire, privBlob);
    default:
      throw new Error(`Algorithm '${algorithm}' is not supported in PPK conversion. Please export as OpenSSH key from PuTTYgen (Conversions → Export OpenSSH key).`);
  }
}

module.exports = { ppkToOpenSSH };
