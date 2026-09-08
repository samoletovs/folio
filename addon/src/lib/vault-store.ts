import { parseEnvelope, type VaultEnvelope } from './vault.ts';
import { encryptedStore, type SavedDocument } from './encrypted-store.ts';

export type SavedVault = SavedDocument<VaultEnvelope>;
const store = encryptedStore('folio-private-policy', 'ips', parseEnvelope, 'IPS');
export const readVault = store.read;
export const writeVault = store.write;
export const discardDamagedVault = store.discardDamaged;
