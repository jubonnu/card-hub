import { useCallback, useEffect, useState } from 'react';

export type ApiRequestState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

/**
 * 2つのGETエンドポイントのみを扱うPhase Mobile-Bの範囲では、TanStack Query等の
 * サーバー状態管理ライブラリを導入せず、最小限のfetch+useState/useEffectで対応する。
 * `deps` が変化する度に `request` を再実行する（`request` 自体は依存配列に含めない —
 * 呼び出し側が毎レンダー新しい関数を渡す前提のため）。
 *
 * `request` には毎回新しい AbortSignal を渡す。deps変更・再取得(retry)・アンマウント時に
 * 直前のリクエストを実際に中断する（＝ `fetch` 自体をキャンセルする）ことで、
 * 古いレスポンスが新しいレスポンスを上書きする競合を防ぎ、不要な通信も止める。
 */
export function useApiRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[]
): ApiRequestState<T> & { retry: () => void } {
  const [state, setState] = useState<ApiRequestState<T>>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    request(controller.signal)
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // abort由来のエラー（中断・アンマウント）は通常の通信エラーとして表示しない。
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({ status: 'error', error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const retry = useCallback(() => setReloadToken((t) => t + 1), []);

  return { ...state, retry };
}
