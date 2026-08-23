-- Selama fase Free-only, seluruh subscription menggunakan plan Free.
-- Plan lainnya tetap disimpan sebagai katalog Coming Soon.
update subscriptions
set plan_id = (select id from plans where code = 'free' limit 1),
    updated_at = current_timestamp
where plan_id in (select id from plans where code <> 'free')
  and exists (select 1 from plans where code = 'free');

update plans
set is_active = case when code = 'free' then 1 else 0 end;
