alter table public.access_requests
  alter column requested_from_name drop not null,
  alter column requested_from_email drop not null;
