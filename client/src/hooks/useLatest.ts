import { useRef, type MutableRefObject } from 'react';

/**
 * A ref that always holds `value` as of the latest render. For callbacks, timers and effects that must read
 * current state without being rebuilt (or re-subscribed) whenever it changes.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
