export interface AdListEntry {
  kind: 'ad';
  key: string;
}

export interface ItemListEntry<T> {
  kind: 'item';
  data: T;
}

export type ListEntry<T> = ItemListEntry<T> | AdListEntry;

/**
 * FlatList用: 一覧に`adInterval`件おきに広告エントリを挟み込む（広告導入、Mobile）。
 * `adInterval`件目の直後に1件広告を入れる（例: adInterval=8なら8件目の後、16件目の後…）。
 * `adInterval <= 0`の場合は広告を挟まない。
 */
export function interleaveAds<T>(items: readonly T[], adInterval: number): ListEntry<T>[] {
  const result: ListEntry<T>[] = [];
  if (adInterval <= 0) {
    for (const item of items) result.push({ kind: 'item', data: item });
    return result;
  }

  let adCount = 0;
  items.forEach((item, index) => {
    result.push({ kind: 'item', data: item });
    if ((index + 1) % adInterval === 0) {
      adCount += 1;
      result.push({ kind: 'ad', key: `ad-${adCount}` });
    }
  });
  return result;
}
