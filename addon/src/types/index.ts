export interface PolicyCategory {
  id: string;
  label: string;
  targetBps: number;
  minimumHorizonYears: number;
  acceptsContributions: boolean;
}

export interface HoldingRule {
  accountId: string;
  holdingId: string;
  categoryId: string | null;
  treatment: 'rebalance' | 'observe' | 'reserve';
  kind: 'security' | 'cash' | 'pension' | 'real-estate';
  terBps: number | null;
}

export interface PolicyGoal {
  id: string;
  label: string;
  targetDate: string;
}

export interface Policy {
  version: 1;
  baseCurrency: string;
  accountIds: string[];
  categories: PolicyCategory[];
  holdings: HoldingRule[];
  goals: PolicyGoal[];
  bands: { absoluteBps: number; relativeBps: number };
  costCeilingBps: number;
  maxQuoteAgeDays: number;
  emergencyFundReady: boolean;
}

export interface SnapshotAccount {
  id: string;
  name: string;
}

export interface SnapshotHolding {
  accountId: string;
  holdingId: string;
  label: string;
  kind: 'cash' | 'security';
  valueMinor: number | null;
  baseCurrency: string;
  asOfDate: string;
}

export interface DataIssue {
  code: string;
  message: string;
  accountId?: string;
  holdingId?: string;
}

export interface Snapshot {
  baseCurrency: string;
  accounts: SnapshotAccount[];
  holdings: SnapshotHolding[];
  issues: DataIssue[];
  fetchedAt: string;
}

export interface AllocationRow {
  categoryId: string;
  label: string;
  valueMinor: number;
  targetBps: number;
  actualBps: number;
  driftBps: number;
  breached: boolean;
}

export interface CostResult {
  knownValueMinor: number;
  unknownValueMinor: number;
  blendedTerBps: number | null;
  complete: boolean;
  overCeiling: boolean;
}

export interface Evaluation {
  complete: boolean;
  issues: DataIssue[];
  totalMinor: number;
  rebalanceMinor: number;
  observedMinor: number;
  reservedMinor: number;
  rows: AllocationRow[];
  costs: CostResult;
}

export interface ContributionRow {
  categoryId: string;
  label: string;
  contributionMinor: number;
  afterMinor: number;
  afterBps: number;
  remainingBreach: boolean;
}

export interface ContributionDraft {
  permitted: boolean;
  reasons: string[];
  contributionMinor: number;
  unallocatedMinor: number;
  rows: ContributionRow[];
}

export function holdingKey(accountId: string, holdingId: string): string {
  return JSON.stringify([accountId, holdingId]);
}
