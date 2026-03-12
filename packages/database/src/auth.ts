import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  maxmem: 32 * 1024 * 1024
} as const;

export interface StoredPasswordHash {
  hash: string;
  salt: string;
  params: {
    keyLength: number;
    cost: number;
    blockSize: number;
    parallelization: number;
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function createPasswordHash(password: string): Promise<StoredPasswordHash> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = scryptSync(password, salt, DEFAULT_KEY_LENGTH, DEFAULT_SCRYPT_PARAMS);

  return {
    hash: derivedKey.toString("base64url"),
    salt,
    params: {
      keyLength: DEFAULT_KEY_LENGTH,
      cost: DEFAULT_SCRYPT_PARAMS.cost,
      blockSize: DEFAULT_SCRYPT_PARAMS.blockSize,
      parallelization: DEFAULT_SCRYPT_PARAMS.parallelization
    }
  };
}

export async function verifyPasswordHash(
  password: string,
  stored: StoredPasswordHash
): Promise<boolean> {
  const derivedKey = scryptSync(password, stored.salt, stored.params.keyLength, {
    cost: stored.params.cost,
    blockSize: stored.params.blockSize,
    parallelization: stored.params.parallelization,
    maxmem: DEFAULT_SCRYPT_PARAMS.maxmem
  });
  const expectedKey = Buffer.from(stored.hash, "base64url");

  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedKey);
}

export function createOpaqueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
