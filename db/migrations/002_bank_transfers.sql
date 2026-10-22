-- Add bank transfers without changing any applied migration or existing COD data.
ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'bank_transfer'));
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cod', 'bank_transfer'));

CREATE TABLE bank_transfer_details (
    payment_id BIGINT PRIMARY KEY REFERENCES payments(id) ON DELETE RESTRICT,
    bank_bin TEXT NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$'),
    bank_name TEXT NOT NULL CHECK (length(bank_name) BETWEEN 2 AND 100),
    account_number TEXT NOT NULL CHECK (account_number ~ '^[0-9]{6,30}$'),
    account_name TEXT NOT NULL CHECK (length(account_name) BETWEEN 2 AND 100),
    reference TEXT NOT NULL UNIQUE CHECK (reference ~ '^[A-Za-z0-9][A-Za-z0-9 -]{0,24}$'),
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
    qr_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
