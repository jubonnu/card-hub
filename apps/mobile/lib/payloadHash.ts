/**
 * オフラインキュー操作の同一性確認用の軽量ハッシュ（FNV-1a、32bit）。暗号学的な用途ではなく、
 * キュー内の`payload`が意図せず変わっていないかを後から確認するための識別子に過ぎない。
 */
export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload) ?? 'null';
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
