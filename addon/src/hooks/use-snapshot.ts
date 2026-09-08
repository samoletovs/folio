import { useCallback, useEffect, useRef, useState } from 'react';
import type { AddonContext, UnlistenFn } from '@wealthfolio/addon-sdk';
import { loadSnapshot } from '../lib/snapshot.ts';
import type { Snapshot } from '../types/index.ts';

export function useSnapshot(ctx: AddonContext, active: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setSnapshot(null);
    setError('');
    if (!active) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await loadSnapshot(ctx.api);
      if (sequence === request.current) setSnapshot(result);
    } catch {
      if (sequence === request.current) setError('Cannot read the Wealthfolio snapshot. Check addon read permissions, then refresh.');
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, [active, ctx]);

  useEffect(() => {
    void refresh();
    if (!active) return;
    let disposed = false;
    const listeners: UnlistenFn[] = [];
    const retain = (unlisten: UnlistenFn) => {
      if (disposed) unlisten();
      else listeners.push(unlisten);
    };
    const subscribe = async () => {
      try {
        retain(await ctx.api.events.portfolio.onUpdateStart(() => {
          ++request.current; setSnapshot(null); setLoading(true); setError('');
        }));
        if (disposed) return;
        retain(await ctx.api.events.portfolio.onUpdateComplete(() => { void refresh(); }));
        if (disposed) return;
        retain(await ctx.api.events.portfolio.onUpdateError(() => {
          ++request.current; setSnapshot(null); setLoading(false);
          setError('Wealthfolio could not update valuations. Resolve the host error and refresh before relying on this assessment.');
        }));
      } catch {
        if (!disposed) {
          ++request.current; setSnapshot(null); setLoading(false);
          setError('Portfolio update notifications are unavailable. Check addon event permissions and reopen folio.');
        }
      }
    };
    void subscribe();
    return () => {
      disposed = true;
      ++request.current;
      listeners.forEach((unlisten) => {
        try { unlisten(); } catch { ctx.api.logger.error('folio could not detach a portfolio event listener. Reopen Wealthfolio.'); }
      });
    };
  }, [active, ctx, refresh]);

  return { snapshot, loading, error, refresh };
}
