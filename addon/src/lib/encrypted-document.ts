const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface EncryptionFormat<F extends string> {
  readonly format: F;
  readonly label: string;
  readonly maxFileBytes: number;
}
export interface EncryptedEnvelope<F extends string> {
  format: F;
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}
export interface EncryptionSession<F extends string> {
  readonly key: CryptoKey;
  readonly salt: string;
  readonly profile: EncryptionFormat<F>;
}
function encode(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(text);
}
function decode(value: unknown, field: string, profile: EncryptionFormat<string>): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
      value.length % 4 !== 0 || value.length > profile.maxFileBytes) {
    throw new Error(`The encrypted ${profile.label} has an invalid ${field}.`);
  }
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error(`The encrypted ${profile.label} has an invalid ${field}.`);
  return bytes;
}
export function parseEncryptedEnvelope<F extends string>(value: unknown, profile: EncryptionFormat<F>): EncryptedEnvelope<F> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !('format' in value) || value.format !== profile.format ||
      !('version' in value) || value.version !== 1 ||
      !('algorithm' in value) || value.algorithm !== 'AES-GCM' ||
      !('kdf' in value) || value.kdf !== 'PBKDF2-SHA256' ||
      !('iterations' in value) || value.iterations !== ITERATIONS ||
      !('salt' in value) || typeof value.salt !== 'string' ||
      !('iv' in value) || typeof value.iv !== 'string' ||
      !('ciphertext' in value) || typeof value.ciphertext !== 'string') {
    throw new Error(`This is not a supported encrypted folio ${profile.label} file.`);
  }
  if (decode(value.salt, 'salt', profile).length !== 16 || decode(value.iv, 'nonce', profile).length !== 12 ||
      decode(value.ciphertext, 'content', profile).length < 16) {
    throw new Error(`The encrypted ${profile.label} is incomplete or damaged.`);
  }
  return {
    format: profile.format, version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS, salt: value.salt, iv: value.iv, ciphertext: value.ciphertext,
  };
}
function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('Secure local encryption is unavailable. Use an up-to-date browser at the local folio address.');
  return crypto.subtle;
}
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const provider = subtle();
  const material = await provider.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return provider.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
export async function createEncryptionSession<F extends string>(passphrase: string, profile: EncryptionFormat<F>): Promise<EncryptionSession<F>> {
  subtle();
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a passphrase of 12 to 1,024 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(passphrase, salt), salt: encode(salt), profile };
}
export async function sealDocument<F extends string>(value: unknown, session: EncryptionSession<F>): Promise<EncryptedEnvelope<F>> {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > session.profile.maxFileBytes / 2) throw new Error(`The ${session.profile.label} exceeds the local file size limit. Remove old recorded snapshots after exporting a backup.`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${session.profile.format}:1`) },
    session.key, bytes,
  );
  return {
    format: session.profile.format, version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS, salt: session.salt, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)),
  };
}
export function parsePrivateJson(text: string, profile: EncryptionFormat<string>): unknown {
  if (encoder.encode(text).length > profile.maxFileBytes) throw new Error(`The ${profile.label} exceeds the local file size limit.`);
  try { return JSON.parse(text); } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`The ${profile.label} is not valid JSON. Correct the file and import it again.`);
    throw error;
  }
}
export async function openDocument<F extends string>(
  input: unknown, passphrase: string, profile: EncryptionFormat<F>,
): Promise<{ value: unknown; session: EncryptionSession<F> }> {
  if (passphrase.length > 1024) throw new Error('The passphrase exceeds the supported length.');
  const envelope = parseEncryptedEnvelope(input, profile);
  const key = await deriveKey(passphrase, decode(envelope.salt, 'salt', profile));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: decode(envelope.iv, 'nonce', profile), additionalData: encoder.encode(`${profile.format}:1`) },
      key, decode(envelope.ciphertext, 'content', profile),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new Error(`Cannot unlock this ${profile.label}. Check the passphrase or restore an undamaged export.`);
    }
    throw error;
  }
  return {
    value: parsePrivateJson(decoder.decode(plaintext), profile),
    session: { key, salt: envelope.salt, profile },
  };
}
