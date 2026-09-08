import { parsePolicy } from './policy.ts';
import type { Policy } from '../types/index.ts';
import { createEncryptionSession, openDocument, parseEncryptedEnvelope, parsePrivateJson, sealDocument, type EncryptedEnvelope } from './encrypted-document.ts';

export const MAX_POLICY_FILE_BYTES = 1_048_576;
const PROFILE = { format: 'folio-encrypted-ips', label: 'IPS', maxFileBytes: MAX_POLICY_FILE_BYTES } as const;
export type VaultEnvelope = EncryptedEnvelope<'folio-encrypted-ips'>;

export function isEncryptedPolicy(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'format' in value && value.format === PROFILE.format;
}
export function parseEnvelope(value: unknown): VaultEnvelope {
  return parseEncryptedEnvelope(value, PROFILE);
}
export async function encryptPolicy(policy: Policy, passphrase: string): Promise<VaultEnvelope> {
  return sealDocument(parsePolicy(policy), await createEncryptionSession(passphrase, PROFILE));
}
export async function decryptPolicy(input: unknown, passphrase: string): Promise<Policy> {
  return parsePolicy((await openDocument(input, passphrase, PROFILE)).value);
}
export function parsePolicyJson(text: string): unknown {
  return parsePrivateJson(text, PROFILE);
}
