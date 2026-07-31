import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRefreshToken,
  getRefreshToken,
  getRefreshTokenDeviceId,
  getStoredDeviceId,
  saveDeviceId,
  saveRefreshToken,
} from '@/lib/secureStore';

describe('secureStore', () => {
  beforeEach(async () => {
    await clearRefreshToken();
  });

  it('Refresh Tokenが無い場合はnullを返す', async () => {
    expect(await getRefreshToken()).toBeNull();
    expect(await getRefreshTokenDeviceId()).toBeNull();
  });

  it('Refresh Tokenとdevice IDを保存・読み出しできる', async () => {
    await saveRefreshToken('token-1', 'device-1');
    expect(await getRefreshToken()).toBe('token-1');
    expect(await getRefreshTokenDeviceId()).toBe('device-1');
  });

  it('clearRefreshTokenで両方削除される', async () => {
    await saveRefreshToken('token-1', 'device-1');
    await clearRefreshToken();
    expect(await getRefreshToken()).toBeNull();
    expect(await getRefreshTokenDeviceId()).toBeNull();
  });

  it('deviceIdは独立して保存・読み出しできる', async () => {
    expect(await getStoredDeviceId()).toBeNull();
    await saveDeviceId('device-abc');
    expect(await getStoredDeviceId()).toBe('device-abc');
  });
});
