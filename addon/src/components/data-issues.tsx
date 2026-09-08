import type { DataIssue, Snapshot } from '../types/index.ts';

export function DataIssues({ issues, snapshot }: { issues: DataIssue[]; snapshot: Snapshot }) {
  return <ul>{issues.map((issue, index) => {
    const account = snapshot.accounts.find((item) => item.id === issue.accountId);
    const holding = snapshot.holdings.find((item) => item.accountId === issue.accountId && item.holdingId === issue.holdingId);
    const source = [
      account?.name ?? (issue.accountId ? `Account ${issue.accountId}` : ''),
      holding?.label ?? (issue.holdingId ? `Holding ${issue.holdingId}` : ''),
    ].filter(Boolean).join(' / ');
    return <li key={`${issue.code}-${index}`}>{source && <strong>{source}: </strong>}{issue.message}</li>;
  })}</ul>;
}
