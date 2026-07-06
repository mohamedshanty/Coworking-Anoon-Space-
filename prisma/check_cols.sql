SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'Session' AND column_name IN ('discountAmount', 'discountNote') ORDER BY column_name;
