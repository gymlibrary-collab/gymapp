-- ============================================================
-- GymApp Migration v44
-- 1. Add gym_id to payslips table
-- 2. Enforce single gym per trainer via unique constraint
-- ============================================================

-- ── 1. Add gym_id to payslips ────────────────────────────────
alter table payslips
  add column if not exists gym_id uuid references gyms(id) on delete set null;

-- Drop old unique constraint (user_id, month, year)
-- and replace with (user_id, gym_id, month, year) to allow
-- one payslip per gym per month for part-timers.
-- gym_id nullable for historical records — use coalesce trick.
-- Postgres can't have unique constraints with nulls easily so
-- we use a partial unique index instead.
drop index if exists payslips_user_month_year_key;
alter table payslips drop constraint if exists payslips_user_id_month_year_key;

-- New unique index: one payslip per user per gym per month/year
-- For full-timers (gym_id not null): enforced directly
-- For historical records (gym_id null): one per user/month/year
create unique index if not exists payslips_user_gym_month_year
  on payslips (user_id, gym_id, month, year)
  where gym_id is not null;

create unique index if not exists payslips_user_month_year_no_gym
  on payslips (user_id, month, year)
  where gym_id is null;

-- ── 2. Enforce single gym per TRAINER role only ─────────────
-- Part-time ops staff (role='staff') can have multiple trainer_gyms
-- rows for multi-gym rostering. Only role='trainer' is restricted
-- to one gym. Enforced via a unique partial index on trainer_id
-- where the user is a trainer.

-- Remove duplicate trainer_gyms rows for trainers only, keeping
-- the most recently assigned one (highest id).
delete from trainer_gyms
  where id in (
    select tg.id from trainer_gyms tg
    inner join trainer_gyms tg2 on tg.trainer_id = tg2.trainer_id and tg.id > tg2.id
    inner join users u on u.id = tg.trainer_id and u.role = 'trainer'
  );

-- Enforce single gym per trainer via application layer and DB trigger.
-- Postgres partial indexes cannot use subqueries, so we use a trigger
-- to enforce the one-gym rule for trainers only.

create or replace function check_trainer_single_gym()
returns trigger language plpgsql as $$
begin
  -- Only enforce for trainer role
  if (select role from users where id = NEW.trainer_id) = 'trainer' then
    if exists (
      select 1 from trainer_gyms
      where trainer_id = NEW.trainer_id
        and id != coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'A trainer can only be assigned to one gym';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_trainer_single_gym on trainer_gyms;
create trigger enforce_trainer_single_gym
  before insert or update on trainer_gyms
  for each row execute function check_trainer_single_gym();

-- Ensure all trainer_gyms rows have is_primary = true
update trainer_gyms set is_primary = true where is_primary = false;

-- ── Verify ───────────────────────────────────────────────────
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'payslips' and column_name = 'gym_id';

select indexname, indexdef
from pg_indexes
where tablename = 'payslips' and indexname like 'payslips_user%';

select conname, contype
from pg_constraint
where conrelid = 'trainer_gyms'::regclass
  and conname = 'trainer_gyms_one_per_trainer';

select 'Migration v44 complete' as status;
