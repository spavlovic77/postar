# Project Rules for Postar

## Database Changes

When making ANY database changes (creating tables, altering columns, adding indexes, creating RLS policies, etc.):

1. **Always update the master schema**: After executing SQL changes, update `/scripts/database/000_master_schema.sql` to reflect the current complete schema state.

2. **Update seed data if needed**: If new tables require initial data or lookup values, update `/scripts/database/002_seed_data.sql` accordingly.

3. **Database script files**:
   - `000_master_schema.sql` - Complete schema with all tables, indexes, and RLS policies
   - `001_clean_all_data.sql` - Script to wipe all data for fresh install
   - `002_seed_data.sql` - Initial seed data (superAdmin, access point providers, etc.)

4. **Keep scripts in sync**: The master schema should always represent the current production database structure so a fresh install can be done at any time.

## Language

- UI text and error messages should be in Slovak (slovenčina)
- Code comments and documentation can be in English

## Authentication & Security

- All auth-related endpoints must have rate limiting
- MFA (passkeys) should be enforced for users who have registered passkeys
- All state-changing actions must be logged to the audit log
