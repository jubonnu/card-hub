import {
  apiErrorResponseSchema,
  listLotteriesResponseSchema,
  lotteryDetailResponseSchema,
  type LotteryDetailResponse,
  type ListLotteriesResponse,
} from '@/schemas/lotteryApi';

// 開発中のみの利便性用フォールバック。本番ビルド（!__DEV__）では絶対に使わない
// （本番URL未設定のまま出荷し、無意味なlocalhost通信で静かに失敗することを防ぐ）。
const DEV_ONLY_FALLBACK_BASE_URL = 'http://localhost:8787';

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigError';
  }
}

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (url) return url;
  if (__DEV__) return DEV_ONLY_FALLBACK_BASE_URL;
  throw new ApiConfigError('EXPO_PUBLIC_API_BASE_URLが設定されていません');
}

export type ApiClientErrorKind = 'network' | 'not_found' | 'invalid_response' | 'server' | 'config';

export class ApiClientError extends Error {
  kind: ApiClientErrorKind;

  constructor(kind: ApiClientErrorKind, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { signal });
  } catch (err) {
    // signalによる中断は通常の通信エラーとして扱わず、そのまま呼び出し元（useApiRequest）に伝播させる。
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof ApiConfigError) throw new ApiClientError('config', err.message);
    throw new ApiClientError('network', 'ネットワークに接続できませんでした');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError('invalid_response', 'サーバーから不正な応答が返されました');
  }

  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(body);
    if (response.status === 404) {
      throw new ApiClientError('not_found', parsedError.success ? parsedError.data.error : 'not_found');
    }
    throw new ApiClientError('server', parsedError.success ? parsedError.data.error : `HTTP ${response.status}`);
  }

  return body;
}

export interface FetchLotteriesParams {
  cardType?: string;
  verificationStatus?: string;
  limit?: number;
  /** 前ページのレスポンスが返した nextCursor。指定する場合は asOf も必ず同じ値を渡すこと。 */
  cursor?: string;
  /** 前ページのレスポンスが返した asOf（ページをまたいでステータス分類を固定するため）。 */
  asOf?: string;
}

export async function fetchLotteries(
  params: FetchLotteriesParams = {},
  signal?: AbortSignal
): Promise<ListLotteriesResponse> {
  const query = new URLSearchParams();
  if (params.cardType) query.set('cardType', params.cardType);
  if (params.verificationStatus) query.set('verificationStatus', params.verificationStatus);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.cursor != null) query.set('cursor', params.cursor);
  if (params.asOf != null) query.set('asOf', params.asOf);

  const qs = query.toString();
  const body = await getJson(`/lotteries${qs ? `?${qs}` : ''}`, signal);

  const parsed = listLotteriesResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError('invalid_response', 'APIレスポンスの形式が想定と異なります');
  }
  return parsed.data;
}

export async function fetchLotteryById(id: number, signal?: AbortSignal): Promise<LotteryDetailResponse> {
  const body = await getJson(`/lotteries/${id}`, signal);

  const parsed = lotteryDetailResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError('invalid_response', 'APIレスポンスの形式が想定と異なります');
  }
  return parsed.data;
}

export interface ApiErrorCopy {
  title: string;
  description: string;
}

export function getApiErrorCopy(error: unknown): ApiErrorCopy {
  if (error instanceof ApiClientError) {
    if (error.kind === 'network') {
      return { title: 'サーバーに接続できませんでした', description: '通信状況を確認して、もう一度読み込んでください' };
    }
    if (error.kind === 'invalid_response') {
      return { title: 'データを正しく読み込めませんでした', description: 'しばらくしてからもう一度お試しください' };
    }
    if (error.kind === 'not_found') {
      return { title: '指定された抽選が見つかりませんでした', description: '削除されたか、URLが正しくない可能性があります' };
    }
    if (error.kind === 'config') {
      return { title: 'アプリの設定に問題があります', description: 'アプリを最新版に更新してから、もう一度お試しください' };
    }
  }
  return { title: '情報を取得できませんでした', description: '通信状況を確認して、もう一度読み込んでください' };
}
