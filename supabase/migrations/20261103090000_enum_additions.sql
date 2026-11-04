-- New enum values used by the migrations that follow. Postgres cannot use a value added in the same transaction,
-- so the additions sit in their own file and run (and commit) first.

-- Expense categories from PRD FR-FIN-003. 'rent_and_utilities' stays for existing rows and is shown as "Rent".
alter type public.expense_category add value if not exists 'data_and_airtime';
alter type public.expense_category add value if not exists 'software_and_hosting';
alter type public.expense_category add value if not exists 'utilities';

-- Target metrics from PRD section 15 (starter targets per role).
alter type public.target_metric add value if not exists 'on_time_deliveries';
alter type public.target_metric add value if not exists 'balances_collected';
alter type public.target_metric add value if not exists 'articles_published';
alter type public.target_metric add value if not exists 'check_in';

-- A message whose channel is not set up yet (no SMS or WhatsApp provider) is marked skipped, not retried forever.
alter type public.notification_status add value if not exists 'skipped';
