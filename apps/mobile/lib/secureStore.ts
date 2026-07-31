import * as SecureStore from 'expo-secure-store';

/**
 * expo-secure-store（iOS Keychain / Android Keystore）の薄いラッパー。
 * Refresh Token・deviceId等、機微または端末アイデンティティに関わる値のみをここに保存する
 * （Access Token・Apple identityToken等の一過性値はここにも他のストレージにも保存しない）。
 */

const KEY_REFRESH_TOKEN = 'cardhub.refreshToken';
const KEY_REFRESH_TOKEN_DEVICE_ID = 'cardhub.refreshTokenDeviceId';
const KEY_DEVICE_ID = 'cardhub.deviceId';

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_REFRESH_TOKEN);
}

export async function getRefreshTokenDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_REFRESH_TOKEN_DEVICE_ID);
}

export async function saveRefreshToken(refreshToken: string, deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, refreshToken);
  await SecureStore.setItemAsync(KEY_REFRESH_TOKEN_DEVICE_ID, deviceId);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN_DEVICE_ID);
}

export async function getStoredDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_DEVICE_ID);
}

export async function saveDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_DEVICE_ID, deviceId);
}
