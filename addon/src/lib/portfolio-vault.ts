import { encryptedStore, type SavedDocument } from './encrypted-store.ts';
import { createEncryptionSession, openDocument, parseEncryptedEnvelope, parsePrivateJson, sealDocument, type EncryptedEnvelope, type EncryptionSession } from './encrypted-document.ts';
import { parsePortfolio, type PortfolioDocument } from './portfolio.ts';

export const PORTFOLIO_FILE_BYTES = 10_485_760;
const PROFILE = { format: 'folio-encrypted-portfolio', label: 'portfolio', maxFileBytes: PORTFOLIO_FILE_BYTES } as const;
export type PortfolioEnvelope = EncryptedEnvelope<'folio-encrypted-portfolio'>;
export type PortfolioSession = EncryptionSession<'folio-encrypted-portfolio'>;
export type SavedPortfolio = SavedDocument<PortfolioEnvelope>;
export const portfolioStore = encryptedStore(
  'folio-private-portfolio', 'workspace', (input) => parseEncryptedEnvelope(input, PROFILE), 'portfolio',
);
export const createPortfolioSession = (passphrase: string) => createEncryptionSession(passphrase, PROFILE);
export const sealPortfolio = (document: PortfolioDocument, session: PortfolioSession) => sealDocument(parsePortfolio(document), session);
export const parsePortfolioFile = (text: string) => parsePrivateJson(text, PROFILE);
export async function openPortfolio(input: unknown, passphrase: string) {
  const { value, session } = await openDocument(input, passphrase, PROFILE);
  return { document: parsePortfolio(value), session };
}
