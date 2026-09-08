-- Activates the alert-routing plumbing added in 20260907190000_admin_anomaly_detection_and_alert_routing.sql.
-- The user doesn't have a Slack workspace ready for this; instead they created a scoped,
-- sending-only Resend API key (restricted to the preppa.live domain, which is DKIM/SPF-verified
-- for sending) and stored it as the `resend_admin_alerts_api_key` Vault secret. This wires
-- notify_admins() to email every admin directly via Resend's API (one email per admin, matching
-- the existing per-admin in-app-notification fan-out) whenever that secret is present, in
-- addition to the still-inert Slack webhook branch -- both are optional and independent, neither
-- required for the other.
create or replace function public.notify_admins(p_kind text, p_title text, p_body text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid;
  v_admin_email text;
  v_webhook_url text;
  v_resend_key text;
begin
  select decrypted_secret into v_resend_key from vault.decrypted_secrets where name = 'resend_admin_alerts_api_key';

  for v_admin, v_admin_email in select p.id, u.email from profiles p join auth.users u on u.id = p.id where p.role = 'admin' loop
    perform notify(v_admin, p_kind, p_title, p_body);

    if v_resend_key is not null and v_admin_email is not null then
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', 'Preppa Admin Alerts <alerts@preppa.live>',
          'to', v_admin_email,
          'subject', '[Preppa admin] ' || p_title,
          'text', coalesce(p_body, p_title)
        )
      );
    end if;
  end loop;

  select decrypted_secret into v_webhook_url from vault.decrypted_secrets where name = 'admin_alert_webhook_url';
  if v_webhook_url is not null then
    perform net.http_post(
      url := v_webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('text', '[Preppa admin] ' || p_title || coalesce(': ' || p_body, ''))
    );
  end if;
exception when others then
  null; -- an alert-delivery hiccup must never break the caller (same contract as notify())
end;
$$;
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;
grant execute on function public.notify_admins(text, text, text) to service_role;
