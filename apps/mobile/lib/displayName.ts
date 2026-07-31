/**
 * プロフィール表示名の解決（Apple Sign-Inは初回認可時のみfullNameを返す仕様への対応）。
 * 優先順位: サーバー保存済みdisplayName → Apple初回取得時のfullName（ローカルキャッシュ）→
 * private relayでないメールのローカル部 → 最終フォールバック「ユーザー」。
 * private relayメール（`@privaterelay.appleid.com`）のランダムなローカル部は表示名に使わない。
 *
 * 現時点でサーバー（x-post-fetcher）はdisplayNameを保存する経路を持たないため、
 * 最初の優先順位は将来サーバー側が対応した場合のためのもので、実質的には常にnullを経由する。
 */

export interface AppleFullNameComponents {
  namePrefix?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nameSuffix?: string | null;
  nickname?: string | null;
}

/** Apple初回認可時のfullNameから表示名文字列を組み立てる。組み立てられなければnull。 */
export function buildAppleDisplayName(fullName: AppleFullNameComponents | null | undefined): string | null {
  if (!fullName) return null;
  const parts = [fullName.familyName, fullName.givenName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );
  if (parts.length === 0) return null;
  return parts.join('');
}

const PRIVATE_RELAY_DOMAIN = '@privaterelay.appleid.com';

export function isPrivateRelayEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(PRIVATE_RELAY_DOMAIN);
}

export interface DisplayNameSource {
  displayName: string | null;
  cachedAppleDisplayName: string | null;
  email: string | null;
}

export function resolveDisplayName(source: DisplayNameSource): string {
  if (source.displayName && source.displayName.trim().length > 0) return source.displayName;
  if (source.cachedAppleDisplayName && source.cachedAppleDisplayName.trim().length > 0) return source.cachedAppleDisplayName;
  if (source.email && !isPrivateRelayEmail(source.email)) {
    const localPart = source.email.split('@')[0];
    if (localPart) return localPart;
  }
  return 'ユーザー';
}
