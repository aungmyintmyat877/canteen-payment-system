-- ============================================================================
-- Canteen Payment & Student ID System — MySQL 8 schema
--
-- Money rule: every monetary column is BIGINT in the currency's MINOR unit
-- (cents). Floats are never stored or computed, so 0.1 + 0.2 style errors
-- cannot happen. formatMoney() in src/lib/money.ts renders minor units.
--
-- Requires MySQL 8.0.16+ so that CHECK constraints are enforced.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS canteen_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE canteen_system;

-- ----------------------------------------------------------------------------
-- Students (card holders). `id` is the student number printed on the card.
-- balance is the source of truth; the transactions table is the ledger.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id         VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  year       INT          NOT NULL,
  pin_hash   VARCHAR(100) NOT NULL,              -- bcrypt hash of the 6-digit payment PIN
  balance    BIGINT       NOT NULL DEFAULT 0,    -- minor units (cents); signed
  qr_secret  CHAR(32)     NOT NULL,              -- per-student random secret mixed into the QR HMAC
  photo_url  VARCHAR(255)     NULL,
  phone      VARCHAR(30)      NULL,
  email      VARCHAR(120)     NULL,
  major      VARCHAR(100)     NULL,
  class_name VARCHAR(60)      NULL,
  status     ENUM('active','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_students_balance_nonneg CHECK (balance >= 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- Staff (cashiers operate the terminal, admins run reports & refunds)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id         VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  role       ENUM('cashier','admin') NOT NULL,
  pin_hash   VARCHAR(100) NOT NULL,              -- bcrypt hash of the staff login PIN
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- Transactions — append-only ledger.
--   amount semantics: topup > 0, refund > 0, payment < 0 (enforced by CHECK)
--   balance_after:    running balance right after this row was applied,
--                     written inside the same transaction as the balance UPDATE.
--   idempotency_key:  UNIQUE. The same key can never insert twice, so a
--                     double-click / network retry can never double-charge.
--   refund_of:        for type='refund', points at the original payment.
--                     UNIQUE → a payment can be refunded at most once.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  student_id      VARCHAR(20)  NOT NULL,
  type            ENUM('topup','payment','refund') NOT NULL,
  amount          BIGINT       NOT NULL,
  balance_after   BIGINT       NOT NULL,
  note            VARCHAR(255)     NULL,
  operator_id     VARCHAR(20)      NULL,          -- cashier/admin who performed it
  idempotency_key VARCHAR(64)  NOT NULL,
  refund_of       BIGINT           NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transactions_idempotency (idempotency_key),
  UNIQUE KEY uq_transactions_refund_of (refund_of),
  KEY idx_transactions_student (student_id, created_at),
  KEY idx_transactions_created (created_at),
  CONSTRAINT fk_transactions_student  FOREIGN KEY (student_id)  REFERENCES students (id),
  CONSTRAINT fk_transactions_operator FOREIGN KEY (operator_id) REFERENCES staff (id),
  CONSTRAINT fk_transactions_refund_of FOREIGN KEY (refund_of)  REFERENCES transactions (id),
  CONSTRAINT chk_transactions_amount CHECK (
    (type = 'payment' AND amount < 0)
    OR (type IN ('topup', 'refund') AND amount > 0)
  )
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- Audit log — who did what, when (logins, scans, topups, payments, refunds)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  actor_id   VARCHAR(20) NOT NULL,
  actor_role ENUM('student','cashier','admin') NOT NULL,
  action     VARCHAR(64) NOT NULL,
  entity     VARCHAR(64)     NULL,
  entity_id  VARCHAR(64)     NULL,
  detail     JSON            NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_actor (actor_id, created_at)
) ENGINE = InnoDB;
