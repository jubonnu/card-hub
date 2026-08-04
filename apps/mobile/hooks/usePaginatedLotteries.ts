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
      hasMore: boolean;
      loadingMore: boolean;
      loadMoreError: unknown | null;
    };

/**
 * GET /lotteries をキーセットページネーション（cursor + asOf）で送りする。「もっと見る」ボタン方式
 * （無限スクロールではない）。並び順（受付中→結果待ち→終了済み→日時未設定）はサーバー側で
 * 確定済みのため、取得したページをクライアント側で再ソートしない（そのまま末尾に追加する）。
 * - asOfは初回レスポンスの値をページ送り全体で固定し続ける（ステータス分類がページ間でずれない）
 * - hasMoreはサーバーが返すnextCursorの有無で判定する（件数からの推測はしない）
 * - 初回読み込み（画面全体）と追加読み込み（末尾のみ）で状態を分ける
 * - 追加読み込み中は `loadingMoreRef` で連打をブロックする（stateの非同期反映を待たない）
 * - 追加取得が失敗しても既存の一覧はそのまま保持し、再試行できる
 * - AbortControllerで初回/追加読み込みそれぞれのリクエストをキャンセルする
 */
export function usePaginatedLotteries(resetKey: unknown) {
  const [state, setState] = useState<PaginatedLotteriesState>({ status: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const asOfRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);

  const loadInitial = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingMoreRef.current = false;
    asOfRef.current = null;
    nextCursorRef.current = null;
    setState({ status: 'loading' });

    fetchLotteries({ limit: LOTTERIES_PAGE_SIZE }, controller.signal)
      .then((res) => {
        asOfRef.current = res.asOf;
        nextCursorRef.current = res.nextCursor;
        setState({
          status: 'ready',
          items: res.lotteries,
          total: res.total,
          hasMore: res.nextCursor !== null,
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

  const [refreshing, setRefreshing] = useState(false);

  /**
   * pull-to-refresh用。`loadInitial`と違いstatusを'loading'へ戻さないため、既存の一覧を
   * 表示したままFlatListのRefreshControlスピナーだけで再取得を表す。1ページ目から取り直し、
   * ページングカーソルもリセットする。失敗時は直前の一覧を保持する（ベストエフォート）。
   */
  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingMoreRef.current = false;
    setRefreshing(true);

    try {
      const res = await fetchLotteries({ limit: LOTTERIES_PAGE_SIZE }, controller.signal);
      asOfRef.current = res.asOf;
      nextCursorRef.current = res.nextCursor;
      setState({
        status: 'ready',
        items: res.lotteries,
        total: res.total,
        hasMore: res.nextCursor !== null,
        loadingMore: false,
        loadMoreError: null,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    const cursor = nextCursorRef.current;
    const asOf = asOfRef.current;
    if (!cursor || !asOf) return;
    loadingMoreRef.current = true;

    setState((prev) => (prev.status === 'ready' ? { ...prev, loadingMore: true, loadMoreError: null } : prev));

    const controller = new AbortController();
    abortRef.current = controller;

    fetchLotteries({ limit: LOTTERIES_PAGE_SIZE, cursor, asOf }, controller.signal)
      .then((res) => {
        asOfRef.current = res.asOf;
        nextCursorRef.current = res.nextCursor;
        setState((current) => {
          if (current.status !== 'ready') return current;
          const existingIds = new Set(current.items.map((item) => item.id));
          const newItems = res.lotteries.filter((item) => !existingIds.has(item.id));
          return {
            ...current,
            items: [...current.items, ...newItems],
            total: res.total,
            hasMore: res.nextCursor !== null,
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
  }, []);

  return { state, retry: loadInitial, loadMore, refresh, refreshing };
}
