-- =============================================================================
-- 0022 — Lot de correctifs n°2 : un employé inséré avec seulement un rôle historique reçoit le
-- type système correspondant (compatibilité des anciens formulaires et des tests).
-- =============================================================================
create or replace function private.sync_employee_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type_id is null then
    new.type_id := case coalesce(new.role, 'pump_attendant')
      when 'manager' then md5('employee_type:gerant')::uuid
      when 'shop_cashier' then md5('employee_type:caissier_boutique')::uuid
      when 'mechanic' then md5('employee_type:mecanicien')::uuid
      when 'washer' then md5('employee_type:laveur')::uuid
      else md5('employee_type:pompiste')::uuid end;
  end if;
  select t.legacy_role into new.role from public.employee_types t where t.id = new.type_id;
  return new;
end;
$$;
drop trigger if exists sync_employee_role on public.employees;
create trigger sync_employee_role before insert or update of type_id on public.employees for each row execute function private.sync_employee_role();
