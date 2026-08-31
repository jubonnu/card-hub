import { useEffect, useState } from 'react';

/** 値の変更から`delayMs`だけ確定を遅らせる（検索入力などの連続変更をまとめて反映するため）。 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
