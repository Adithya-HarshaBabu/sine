export function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>()
  return {
    emit: (value: T) => listeners.forEach((l) => l(value)),
    on: (cb: (value: T) => void) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
  }
}
