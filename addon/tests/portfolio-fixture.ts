import { emptyPortfolio, type PortfolioDocument } from '../src/lib/portfolio.ts';

export function generatedPortfolio(): PortfolioDocument {
  return {
    ...emptyPortfolio('EUR'),
    accounts: Array.from({ length: 2 }, (_, index) => ({ id: `generated-account-${index}`, name: `Generated account ${index}` })),
    holdings: Array.from({ length: 2 }, (_, index) => ({
      id: `generated-holding-${index}`, accountId: `generated-account-${index}`, name: `Generated holding ${index}`,
      symbol: '', kind: index === 0 ? 'security' : 'cash',
      valueMinor: (index + 1) * 100, asOfDate: new Date().toISOString().slice(0, 10), units: null,
    })),
  };
}
