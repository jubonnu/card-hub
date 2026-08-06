import { useEffect, useState } from 'react';

const UPDATE_INTERVAL_MS = 60_000;

/**
 * 現在時刻をISO文字列で返す。締切・当選発表までの残り時間表示等が、画面マウント時点の
 * 時刻に固定されたまま更新されなくなる（`useMemo(() => new Date().toISOString(), [])`の
 * ように依存配列を空にした場合に起きる）のを防ぐため、一定間隔で再計算して再レンダリングを促す。
 */
export function useNowIso(): string {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = setInterval(() => setNowIso(new Date().toISOString()), UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return nowIso;
}
