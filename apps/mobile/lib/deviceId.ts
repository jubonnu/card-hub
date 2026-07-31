import { generateClientRequestId } from '@/lib/clientRequestId';
import { getStoredDeviceId, saveDeviceId } from '@/lib/secureStore';

/**
 * 端末固有deviceId（refresh_tokens.deviceId用）。SecureStoreの値のみを正とし、
 * AsyncStorageへは複製しない（複数ストレージ間の不整合を防ぐため）。
 * 再インストールで値が変わるのは許容する（G2Aの設計通り）。
 */

let inFlightCreate: Promise<string> | null = null;

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getStoredDeviceId();
  if (existing) return existing;

  if (inFlightCreate) return inFlightCreate;

  inFlightCreate = (async () => {
    try {
      const deviceId = generateClientRequestId();
      await saveDeviceId(deviceId);
      return deviceId;
    } finally {
      inFlightCreate = null;
    }
  })();

  return inFlightCreate;
}
