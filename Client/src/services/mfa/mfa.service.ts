import { authenticator } from "otplib";
import { HashAlgorithms } from "@otplib/core";
import { mfaSecureStorage } from "./secure-storage.adapter";

const APP_NAME = "ChatApp";
const ISSUER = "ChatApp";
const OTP_ALGORITHM = "SHA1";
const OTP_ALGORITHM_LIB = HashAlgorithms.SHA1;
const OTP_DIGITS = 6;
const OTP_PERIOD_SECONDS = 30;
const OTP_WINDOW = 1;

export interface MfaOnboardingData {
  secret: string;
  otpAuthUri: string;
  accountName: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
}

const withOptions = <T>(fn: () => T, epochMs?: number): T => {
  const previous = { ...authenticator.options };
  authenticator.options = {
    ...previous,
    algorithm: OTP_ALGORITHM_LIB,
    digits: OTP_DIGITS,
    step: OTP_PERIOD_SECONDS,
    ...(typeof epochMs === "number" ? { epoch: epochMs } : {}),
  };
  try {
    return fn();
  } finally {
    authenticator.options = previous;
  }
};

const constantTimeEqual = (a: string, b: string): boolean => {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
};

const sanitizeToken = (token: string): string => token.replace(/\D/g, "");

const buildOtpAuthUri = (userEmail: string, secret: string): string => {
  const account = `${APP_NAME}:${userEmail}`;
  const label = encodeURIComponent(account);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=${OTP_ALGORITHM}&digits=${OTP_DIGITS}&period=${OTP_PERIOD_SECONDS}`;
};

const getTokenAt = (secret: string, epochMs: number): string =>
  withOptions(() => authenticator.generate(secret), epochMs);

const getNow = (): number => Date.now();

export const mfaService = {
  generateSecret(): string {
    return withOptions(() => authenticator.generateSecret());
  },

  createOnboardingData(userEmail: string, secret: string): MfaOnboardingData {
    return {
      secret,
      otpAuthUri: buildOtpAuthUri(userEmail, secret),
      accountName: `${APP_NAME}:${userEmail}`,
      issuer: ISSUER,
      algorithm: OTP_ALGORITHM,
      digits: OTP_DIGITS,
      period: OTP_PERIOD_SECONDS,
    };
  },

  async getOrCreateSecret(userEmail: string): Promise<string> {
    const existing = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    if (existing) return existing;
    const secret = this.generateSecret();
    await mfaSecureStorage.setVaultMfaSecret(userEmail, secret);
    return secret;
  },

  async getOnboardingData(userEmail: string): Promise<MfaOnboardingData> {
    const secret = await this.getOrCreateSecret(userEmail);
    return this.createOnboardingData(userEmail, secret);
  },

  async isEnabled(userEmail: string): Promise<boolean> {
    const secret = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    return !!secret;
  },

  verifyToken(secret: string, token: string, nowMs: number = getNow()): boolean {
    const cleaned = sanitizeToken(token);
    if (!/^\d{6}$/.test(cleaned)) return false;
    for (let offset = -OTP_WINDOW; offset <= OTP_WINDOW; offset += 1) {
      const epochMs = nowMs + offset * OTP_PERIOD_SECONDS * 1000;
      const expected = getTokenAt(secret, epochMs);
      if (constantTimeEqual(expected, cleaned)) {
        return true;
      }
    }
    return false;
  },

  async verifyUserToken(userEmail: string, token: string): Promise<boolean> {
    const secret = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    if (!secret) return false;
    return this.verifyToken(secret, token);
  },
};
