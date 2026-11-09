-- BankAI database schema. Safe to run many times (IF NOT EXISTS everywhere).
-- Money is always stored in PAISE as BIGINT (Rs 1 = 100 paise). Never floats.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  kyc_status    TEXT NOT NULL DEFAULT 'not_started'
                CHECK (kyc_status IN ('not_started', 'verified', 'needs_review', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL UNIQUE REFERENCES users(id),
  account_number TEXT NOT NULL UNIQUE,
  -- Second safety net: even if the code had a bug, the database refuses a negative balance.
  balance_paise  BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved payees. You must add a payee before sending them money.
CREATE TABLE IF NOT EXISTS beneficiaries (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id),
  nickname       TEXT NOT NULL,
  account_number TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_number)
);

-- Every movement of money. from = NULL means money came from outside (salary, deposit).
-- to = NULL means money went outside (a merchant like Swiggy).
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  request_id      TEXT,
  from_account_id INT REFERENCES accounts(id),
  to_account_id   INT REFERENCES accounts(id),
  merchant        TEXT,
  amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
  category        TEXT NOT NULL DEFAULT 'Other',
  note            TEXT,
  status          TEXT NOT NULL CHECK (status IN ('completed', 'on_hold', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotency: one request_id can create only one payment per account.
  CONSTRAINT transactions_request_unique UNIQUE (from_account_id, request_id)
);
CREATE INDEX IF NOT EXISTS transactions_from_idx ON transactions (from_account_id, created_at);
CREATE INDEX IF NOT EXISTS transactions_to_idx   ON transactions (to_account_id, created_at);

-- Payments held by the fraud rules, waiting for an admin.
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id             SERIAL PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE REFERENCES transactions(id),
  reasons        JSONB NOT NULL,
  ai_explanation TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  reviewed_by    INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- One row per KYC attempt. We never store the plain PAN: only a masked copy and a keyed hash.
CREATE TABLE IF NOT EXISTS kyc_applications (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id),
  entered_name TEXT NOT NULL,
  entered_dob  DATE NOT NULL,
  pan_masked   TEXT NOT NULL,
  pan_hash     TEXT NOT NULL,
  extracted    JSONB,
  checks       JSONB NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('verified', 'needs_review', 'rejected')),
  reason       TEXT,
  image_path   TEXT,
  reviewed_by  INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
-- A PAN can be verified for only one customer.
CREATE UNIQUE INDEX IF NOT EXISTS kyc_one_verified_pan ON kyc_applications (pan_hash) WHERE status = 'verified';

-- Cache of AI answers, so we ask Gemini about a merchant only once.
CREATE TABLE IF NOT EXISTS merchant_categories (
  merchant_key TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only record of important actions (logins, payments, KYC, reviews).
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
