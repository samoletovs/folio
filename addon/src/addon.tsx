import React from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { Card, CardContent, Icons } from '@wealthfolio/ui';

function FolioHome({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="p-6">
          <h1 className="text-2xl font-semibold mb-2">folio</h1>
          <p className="text-muted-foreground">
            Local-first portfolio companion. folio reads your Wealthfolio data
            on-device, checks your allocation against your Investment Policy
            Statement (IPS), and drafts rebalancing for your sign-off. It
            explains and checks — it never trades, and never computes the
            numbers itself (the math stays in Wealthfolio).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  // Add a sidebar item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'folio',
    label: 'folio',
    icon: <Icons.Blocks className="h-5 w-5" />,
    route: '/addon/folio',
    order: 100,
  });

  // Add a route
  const Wrapper = () => <FolioHome ctx={ctx} />;
  ctx.router.add({
    path: '/addon/folio',
    component: React.lazy(() => Promise.resolve({ default: Wrapper })),
  });

  // Cleanup on disable
  ctx.onDisable(() => {
    try {
      sidebarItem.remove();
    } catch (err) {
      ctx.api.logger.error('Failed to remove sidebar item:', err);
    }
  });
}
