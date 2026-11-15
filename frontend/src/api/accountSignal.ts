// A tiny signal so the REST client can say "the account just changed"
// without importing the account store (which imports the REST client).

const listeners = new Set<() => void>()

export function signalAccountChanged(): void {
  for (const fn of [...listeners]) fn()
}

export function onAccountChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
