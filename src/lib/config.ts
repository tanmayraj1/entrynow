/**
 * Admin-editable business constants (spec A3).
 *
 * Every value here is stored in the `config_settings` table so an admin can
 * change it without a deploy. The literals below are the spec's defaults and
 * act only as a fallback when a key is missing.
 */

import { db } from "./db";
import { type MoneyConfig, toPaise } from "./money";

export interface BusinessConfig extends MoneyConfig {
  bookingHoldMinutes: number;
  payoutDelayDays: number;

  otpLength: number;
  otpValidityMinutes: number;
  otpMaxSendsPer10Min: number;
  otpMaxVerifyAttempts: number;
  otpLockMinutes: number;

  planBasicPricePaise: number;
  planBasicLiveEventCap: number;
  planProPricePaise: number;
  /** Assigning Pro writes this as the organizer's commission override (D-007). */
  planProCommissionPct: number;

  reviewWindowDays: number;

  referrerCreditPaise: number;
  refereeCreditPaise: number;
  referralMinBookingPaise: number;

  /** Spec C6.2 — below this many hours before the session, seats stay burned. */
  inventoryRestoreThresholdHours: number;
  /** Spec C5.1 */
  transferCutoffHours: number;
  /** Spec B1 — event completes this long after the last session ends. */
  eventCompleteBufferHours: number;

  /** Spec E3 */
  announcementsPerEventPerWeek: number;
  /** Spec D2.2 — batches under this settle without a FINANCE click. */
  payoutAutoApproveCeilingPaise: number;
  /** Spec E4 — INVALID scans per minute at one gate before alerting. */
  invalidScanAlertPerMinute: number;
}

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  // Money (spec A3)
  bookingFeePct: 3.5,
  bookingFeeMinPaise: toPaise(15),
  bookingFeeMaxPaise: toPaise(99),
  gstPct: 18,
  platformCommissionPct: 8,

  bookingHoldMinutes: 8,
  payoutDelayDays: 3,

  otpLength: 6,
  otpValidityMinutes: 5,
  otpMaxSendsPer10Min: 3,
  otpMaxVerifyAttempts: 5,
  otpLockMinutes: 30,

  // Spec A3 ONBOARDING_PLANS. Supersedes the design's ₹10k/₹25k (D-007).
  planBasicPricePaise: toPaise(4999),
  planBasicLiveEventCap: 5,
  planProPricePaise: toPaise(14999),
  planProCommissionPct: 6,

  reviewWindowDays: 14,

  referrerCreditPaise: toPaise(100),
  refereeCreditPaise: toPaise(50),
  referralMinBookingPaise: toPaise(499),

  inventoryRestoreThresholdHours: 6,
  transferCutoffHours: 2,
  eventCompleteBufferHours: 6,

  announcementsPerEventPerWeek: 3,
  payoutAutoApproveCeilingPaise: toPaise(50000),
  invalidScanAlertPerMinute: 5,
};

type ConfigKey = keyof BusinessConfig;

let cache: { value: BusinessConfig; at: number } | null = null;
const TTL_MS = 60_000;

/**
 * Read the live config. Cached for 60s — these are read on every booking, and
 * an admin edit taking up to a minute to propagate is acceptable.
 */
export async function getBusinessConfig(): Promise<BusinessConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const rows = await db.configSetting.findMany();
  const merged = { ...DEFAULT_BUSINESS_CONFIG };
  for (const row of rows) {
    if (row.key in merged) {
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }

  cache = { value: merged, at: Date.now() };
  return merged;
}

/** Call after an admin writes a setting so the next read is fresh. */
export function invalidateConfigCache() {
  cache = null;
}

export async function setConfigValue(
  key: ConfigKey,
  value: BusinessConfig[ConfigKey],
  updatedBy?: string,
) {
  await db.configSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
  invalidateConfigCache();
}

/**
 * The commission rate to apply to a booking: the organizer's override when set,
 * otherwise the platform default. Snapshotted onto the booking and every
 * ledger row so a later change cannot rewrite settled money (spec G2).
 */
export function resolveCommissionPct(
  organizerOverride: number | null | undefined,
  config: BusinessConfig,
): number {
  return organizerOverride ?? config.platformCommissionPct;
}
