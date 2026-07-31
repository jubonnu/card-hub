import { describe, expect, it } from 'vitest';

import { getOrCreateDeviceId } from '@/lib/deviceId';
import { getStoredDeviceId } from '@/lib/secureStore';

describe('deviceId', () => {
  it('初回呼び出しで生成しSecureStoreへ保存する', async () => {
    const deviceId = await getOrCreateDeviceId();
    expect(deviceId).toEqual(expect.any(String));
    expect(await getStoredDeviceId()).toBe(deviceId);
  });

  it('2回目以降は既存の値を再利用する（再生成しない）', async () => {
    const first = await getOrCreateDeviceId();
    const second = await getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it('同時に複数回呼ばれても1つのdeviceIdに収束する', async () => {
    const [a, b, c] = await Promise.all([getOrCreateDeviceId(), getOrCreateDeviceId(), getOrCreateDeviceId()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
