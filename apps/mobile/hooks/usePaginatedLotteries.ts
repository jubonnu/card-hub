import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchLotteries } from '@/lib/apiClient';
import type { LotteryRecord } from '@/schemas/lotteryApi';

export const LOTTERIES_PAGE_SIZE = 10;

export type PaginatedLotteriesState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      items: LotteryRecord[];
      total: number;
      lastPageSize: number;
      loadingMore: boolean;
      loadMoreError: unknown | null;
    };

/**
 * GET /lotteries を limit/offset でページ送りする。「もっと見る」ボタン方式（無限スクロールではない）。
 * - 初回読み込み（画面全体）と追加読み込み（末尾のみ）で状態を分ける
 * - 追加取得は同じIDを重複追加しない
 * - 追加読み込み中は `loadingMoreRef` で連打をブロックする（stateの非同期反映を待たない）
 * - 追加取得が失敗しても既存の一覧はそのまま保持し、再試行できる
 * - AbortControllerで初回/追加読み込みそれぞれのリクエストをキャンセルする
 */
export function usePaginatedLotteries(resetKey: unknown) {
  const [state, setState] = useState<PaginatedLotteriesState>({ status: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const loadInitial = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingMoreRef.current = false;
    setState({ status: 'loading' });

    fetchLotteries({ limit: LOTTERIES_PAGE_SIZE, offset: 0 }, controller.signal)
      .then((res) => {
        setState({
          status: 'ready',
          items: res.lotteries,
          total: res.total,
          lastPageSize: res.lotteries.length,
          loadingMore: false,
          loadMoreError: null,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({ status: 'error', error });
      });
  }, []);

  useEffect(() => {
    loadInitial();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;

    setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true, loadMoreError: null } : prev));

    setState((prev) => {
      if (prev.status !== 'ready') {
        loadingMoreRef.current = false;
        return prev;
      }

      const offset = prev.items.length;
      const controller = new AbortController();
      abortRef.current = controller;

      fetchLotteries({ limit: LOTTERIES_PAGE_SIZE, offset }, controller.signal)
        .then((res) => {
          setState((current) => {
            if (current.status !== 'ready') return current;
            const existingIds = new Set(current.items.map((item) => item.id));
            const newItems = res.lotteries.filter((item) => !existingIds.has(item.id));
            return {
              ...current,
              items: [...current.items, ...newItems],
              total: res.total,
              lastPageSize: res.lotteries.length,
              loadingMore: false,
              loadMoreError: null,
            };
          });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setState((current) =>
            current.status === 'ready' ? { ...current, loadingMore: false, loadMoreError: error } : current
          );
        })
        .finally(() => {
          loadingMoreRef.current = false;
        });

      return prev;
    });
  }, []);

  return { state, retry: loadInitial, loadMore };
}
