import { describe, expect, it } from 'vitest';

import lotteriesListFixture from '@/__fixtures__/api/lotteries-list.json';
import lotteryDetailFixture from '@/__fixtures__/api/lottery-detail.json';
import lotteryDetailNotFoundFixture from '@/__fixtures__/api/lottery-detail-not-found.json';
import {
  apiErrorResponseSchema,
  listLotteriesResponseSchema,
  lotteryDetailResponseSchema,
} from './lotteryApi';

/**
 * このテストは x-post-fetcher/apps/worker のローカル開発サーバー（`npm run dev`）から
 * 実際に取得したレスポンスをフィクスチャとして保存し、それを本スキーマでパースできることを
 * 確認する。バックエンドのレスポンス形状が変わってここが失敗した場合、
 * モバイル側の型・表示ロジックの見直しが必要というシグナルになる。
 */
describe('lotteryApi schemas against real fixtures', () => {
  it('parses GET /lotteries response', () => {
    const result = listLotteriesResponseSchema.safeParse(lotteriesListFixture);
    expect(result.success).toBe(true);
  });

  it('parses GET /lotteries/:id response', () => {
    const result = lotteryDetailResponseSchema.safeParse(lotteryDetailFixture);
    expect(result.success).toBe(true);
  });

  it('parses GET /lotteries/:id 404 error response', () => {
    const result = apiErrorResponseSchema.safeParse(lotteryDetailNotFoundFixture);
    expect(result.success).toBe(true);
  });

  it('rejects a response missing required fields', () => {
    const result = listLotteriesResponseSchema.safeParse({ ok: true, lotteries: [{}] });
    expect(result.success).toBe(false);
  });
});
