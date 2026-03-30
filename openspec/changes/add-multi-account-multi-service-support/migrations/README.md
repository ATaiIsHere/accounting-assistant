# Migration Drafts

These SQL files are draft migration artifacts for the proposed multi-account, multi-service refactor. They are not wired into the current deploy flow yet.

## Intended order

1. Run `001_add_multi_account_schema.sql`
2. Update application code to read and write by `account_id`
3. Verify Telegram behavior still works and new provider/account resolution is correct
4. Run `002_cleanup_legacy_user_id.sql` only after the app no longer depends on legacy `user_id` columns

## Notes

- `001_add_multi_account_schema.sql` is additive and designed to preserve existing data.
- The additive migration auto-creates one legacy account per distinct existing `user_id` found in current bookkeeping tables and maps those identities to the `telegram` provider.
- If the database is empty, no legacy accounts are created. In that case, an admin provisioning script must create the initial accounts and identities before the new app flow can be used.
- `002_cleanup_legacy_user_id.sql` rebuilds tables to remove deprecated ownership columns and tighten constraints. Treat it as a follow-up step, not part of the first risky cutover.
