import * as Crypto from 'expo-crypto';

/** サーバーの冪等性台帳・オフラインキューで使うUUIDv4を生成する。 */
export function generateClientRequestId(): string {
  return Crypto.randomUUID();
}
