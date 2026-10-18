-- Payments read from your PayPal and Wise emails (sent by a small Google Apps Script in your own Gmail).
-- The script proves it's yours with a private key. Only a fingerprint (SHA-256) of the key is stored.
alter table public.profiles add column if not exists inbox_key_hash text not null default '';
alter table public.invoices add column if not exists source_ref text; -- the email's id, so one email is never counted twice
create unique index if not exists invoices_source_ref_idx on public.invoices (user_id, source_ref) where source_ref is not null;

-- Records one payment for whoever owns the key. Marks a matching open invoice paid, or adds a PAY-### payment.
create or replace function public.record_email_payment(
  p_key text, p_ref text, p_source text, p_amount numeric, p_currency text,
  p_payer text default '', p_payer_email text default '', p_date date default current_date, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; cid uuid; cname text; inv_id uuid; inv_no text; num text;
  payer text := lower(trim(coalesce(p_payer, ''))); payer_email text := lower(trim(coalesce(p_payer_email, '')));
begin
  if p_key is null or length(p_key) < 32 or p_amount is null or p_amount <= 0 or p_ref is null or p_currency !~ '^[A-Z]{3}$' then
    return jsonb_build_object('error', 'bad request');
  end if;
  select user_id into uid from public.profiles where inbox_key_hash <> '' and inbox_key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if uid is null then return jsonb_build_object('error', 'unknown key'); end if;
  if exists (select 1 from public.invoices where user_id = uid and source_ref = p_ref) then return jsonb_build_object('duplicate', true); end if;

  -- Who paid: their email first, then their name or business name.
  select c.id, coalesce(nullif(c.company, ''), c.name) into cid, cname from public.clients c
  where c.user_id = uid and (
    (payer_email <> '' and lower(c.email) = payer_email)
    or (payer <> '' and length(c.name) > 2 and (payer like '%' || lower(c.name) || '%' or lower(c.name) like '%' || payer || '%'))
    or (payer <> '' and length(c.company) > 2 and (payer like '%' || lower(c.company) || '%' or lower(c.company) like '%' || payer || '%'))
  )
  order by (payer_email <> '' and lower(c.email) = payer_email) desc, c.status = 'Active' desc
  limit 1;

  -- An open invoice for them for about this amount (fees can take a few percent) gets marked paid.
  if cid is not null then
    select i.id, i.number into inv_id, inv_no from public.invoices i
    where i.user_id = uid and i.client_id = cid and i.status <> 'paid' and i.currency = p_currency
      and abs((select coalesce(sum((x->>'qty')::numeric * (x->>'rate')::numeric), 0) from jsonb_array_elements(i.items) x) - p_amount) <= greatest(1, p_amount * 0.06)
    order by i.issue_date limit 1;
    if inv_id is not null then
      update public.invoices set status = 'paid', paid_date = p_date, paid_amount = p_amount, method = p_source, source_ref = p_ref where id = inv_id;
      return jsonb_build_object('matched', inv_no, 'client', cname);
    end if;
  end if;

  select 'PAY-' || lpad((coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
    into num from public.invoices where user_id = uid and number like 'PAY-%';
  insert into public.invoices (user_id, client_id, number, issue_date, currency, status, items, paid_date, paid_amount, method, notes, source_ref)
  values (uid, cid, num, p_date, p_currency, 'paid',
    jsonb_build_array(jsonb_build_object('desc', coalesce(nullif(p_note, ''), 'Payment from ' || coalesce(nullif(p_payer, ''), p_source)), 'qty', 1, 'rate', p_amount)),
    p_date, p_amount, p_source, 'Added automatically from your ' || p_source || ' email.', p_ref);
  return jsonb_build_object('created', num, 'client', cname);
end $$;
revoke all on function public.record_email_payment(text, text, text, numeric, text, text, text, date, text) from public;
grant execute on function public.record_email_payment(text, text, text, numeric, text, text, text, date, text) to anon, authenticated;
