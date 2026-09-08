import React, { useSyncExternalStore } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { createLifecycle } from './lib/lifecycle.ts';
import { FolioPage } from './pages/folio-page.tsx';

export default function enable(ctx: AddonContext) {
  const lifecycle = createLifecycle();
  const sidebarItem = ctx.sidebar.addItem({
    id: 'folio', label: 'folio', route: '/addon/folio', order: 100,
    icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20h18" /></svg>,
  });
  const Page = () => {
    const active = useSyncExternalStore(lifecycle.subscribe, lifecycle.isActive, lifecycle.isActive);
    return active ? <FolioPage ctx={ctx} /> : <p>folio is disabled. Enable it in Wealthfolio to reopen your policy.</p>;
  };
  ctx.router.add({
    path: '/addon/folio',
    component: React.lazy(() => Promise.resolve({ default: Page })),
  });
  ctx.onDisable(() => {
    lifecycle.disable();
    try { sidebarItem.remove(); }
    catch { ctx.api.logger.error('Failed to remove the folio sidebar item. Reopen Wealthfolio.'); }
  });
}
