export function createLifecycle() {
  let active = true;
  const listeners = new Set<() => void>();
  return {
    isActive: () => active,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    disable() {
      if (!active) return;
      active = false;
      listeners.forEach((listener) => listener());
      listeners.clear();
    },
  };
}

export type AddonLifecycle = ReturnType<typeof createLifecycle>;
