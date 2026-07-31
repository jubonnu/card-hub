import { describe, expect, it } from 'vitest';

import { buildAppleDisplayName, isPrivateRelayEmail, resolveDisplayName } from '@/lib/displayName';

describe('buildAppleDisplayName', () => {
  it('familyName・givenNameがあれば結合する', () => {
    expect(buildAppleDisplayName({ familyName: '山田', givenName: '太郎' })).toBe('山田太郎');
  });

  it('familyNameのみでも組み立てる', () => {
    expect(buildAppleDisplayName({ familyName: '山田', givenName: null })).toBe('山田');
  });

  it('全フィールドが無ければnull', () => {
    expect(buildAppleDisplayName({ familyName: null, givenName: null })).toBeNull();
  });

  it('fullName自体がnullならnull', () => {
    expect(buildAppleDisplayName(null)).toBeNull();
  });
});

describe('isPrivateRelayEmail', () => {
  it('privaterelay.appleid.comドメインを判定する', () => {
    expect(isPrivateRelayEmail('abcdef123@privaterelay.appleid.com')).toBe(true);
    expect(isPrivateRelayEmail('taro@example.com')).toBe(false);
    expect(isPrivateRelayEmail(null)).toBe(false);
  });
});

describe('resolveDisplayName', () => {
  it('優先順位1: サーバー保存済みdisplayNameを最優先する', () => {
    expect(
      resolveDisplayName({ displayName: '太郎', cachedAppleDisplayName: '山田太郎', email: 'taro@example.com' })
    ).toBe('太郎');
  });

  it('優先順位2: displayNameが無ければApple初回取得のキャッシュ名を使う', () => {
    expect(resolveDisplayName({ displayName: null, cachedAppleDisplayName: '山田太郎', email: 'taro@example.com' })).toBe(
      '山田太郎'
    );
  });

  it('優先順位3: private relayでないメールのローカル部を使う', () => {
    expect(resolveDisplayName({ displayName: null, cachedAppleDisplayName: null, email: 'taro@example.com' })).toBe('taro');
  });

  it('private relayメールのローカル部は使わない（最終フォールバックへ）', () => {
    expect(
      resolveDisplayName({ displayName: null, cachedAppleDisplayName: null, email: 'abcdef123@privaterelay.appleid.com' })
    ).toBe('ユーザー');
  });

  it('優先順位4: 何も無ければ「ユーザー」', () => {
    expect(resolveDisplayName({ displayName: null, cachedAppleDisplayName: null, email: null })).toBe('ユーザー');
  });
});
