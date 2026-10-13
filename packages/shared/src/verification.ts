export interface VerificationSettings {
  /** How long citizens have to respond after an issue is marked resolved. */
  windowHours: number;
  /** Confirmations needed (capped at the number of eligible citizens). */
  minConfirmations: number;
  /** Share of non-skipping eligible citizens that must confirm. */
  ratio: number;
  /** When the window closes with no responses at all, verify anyway. */
  autoVerifyOnSilence: boolean;
  /** Officials must attach a work-completion photo before marking resolved. */
  requireCompletionPhoto: boolean;
}

export const DEFAULT_VERIFICATION_SETTINGS: VerificationSettings = {
  windowHours: 72,
  minConfirmations: 2,
  ratio: 0.5,
  autoVerifyOnSilence: false,
  requireCompletionPhoto: true,
};

export interface VerificationTally {
  eligible: number;
  resolved: number;
  notFixed: number;
  skipped: number;
}

export type VerificationDecision = 'REOPEN' | 'VERIFY' | 'WAIT' | 'EXPIRE';

/**
 * Decides what happens to a verification round.
 *
 * - Any "still not fixed" (which always carries a photo) reopens the issue.
 * - Enough confirmations verify it.
 * - When the window closes: one or more confirmations verify, silence expires
 *   (or verifies, if `autoVerifyOnSilence`).
 */
export function evaluateVerification(
  tally: VerificationTally,
  settings: Pick<VerificationSettings, 'minConfirmations' | 'ratio' | 'autoVerifyOnSilence'>,
  closing = false,
): VerificationDecision {
  if (tally.notFixed > 0) return 'REOPEN';

  const required = Math.max(1, Math.min(tally.eligible, settings.minConfirmations));
  const deciding = tally.eligible - tally.skipped;
  if (tally.resolved >= required && deciding > 0 && tally.resolved / deciding >= settings.ratio)
    return 'VERIFY';

  const responded = tally.resolved + tally.notFixed + tally.skipped;
  const everyoneResponded = tally.eligible > 0 && responded >= tally.eligible;

  if (closing || everyoneResponded) {
    if (tally.resolved > 0) return 'VERIFY';
    if (responded === 0 && settings.autoVerifyOnSilence) return 'VERIFY';
    return 'EXPIRE';
  }
  return 'WAIT';
}
