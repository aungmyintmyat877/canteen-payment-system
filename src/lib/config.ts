/**
 * Debt (အကြွေး) rule — a student may go below zero, but never below this.
 * Money is in minor units: 5_000 = 5,000 kyat.
 * If you change this, also update the DB CHECK (chk_students_balance_floor).
 */
/** Students may go into debt down to -$5,000.00 = -500_000 minor units. */
export const DEBT_LIMIT_MINOR = 500_000;