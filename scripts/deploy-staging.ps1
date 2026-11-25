<#
.SYNOPSIS
  Ordered, stop-at-every-human-step deploy of the Preppa TEST Supabase project (DESIGN L1 checklist 4-9).

.DESCRIPTION
  Targets the test project only. It refuses the production ref, a live Stripe key, and any project you
  do not confirm by typing its name. It never prints or stores a secret: secret values are read as
  SecureString, written to a temp env file that is deleted in `finally`, and only ids, prefixes and
  counts reach the evidence file.

  Order (do not reorder; docs/web-launch/DESIGN.md section 4 and the L1 checklist):
    1 preflight        CLI, login, branch, ref guard, typed confirmation
    2 link             supabase link to the test ref
    3 vault            YOU run generated SQL: project_base_url, stripe_setup_secret, stripe_sync_worker_secret
    4 secrets+guarded  set STRIPE_SECRET_KEY + STRIPE_EXPECTED_ACCOUNT, deploy stripe-setup/-webhook/-worker
    5 verify key       sk_test_/rk_test_ and GET /v1/account equals the expected acct id; record webhook ids
    6 negative check   wrong STRIPE_EXPECTED_ACCOUNT must make stripe-setup refuse; webhooks unchanged; restore
    7 stripe-setup     POST stripe-setup; the test webhook list changes only by the managed webhook
    8 migrations       supabase db push (raises without project_base_url by design), then YOU run
                       select public.install_stripe_reconcile_triggers(); twice and check
    9 functions        remaining functions one by one: create-order, decline-order, then the rest

  Evidence is appended to docs/web-launch/L1-EVIDENCE.md (ids, prefixes, counts only).

.PARAMETER ProjectRef       Test project ref. Default is preppa-test.
.PARAMETER ExpectedAccount  The preppa-test Stripe Sandbox acct_ id.
.PARAMETER LocalAccount     The preppa-local Stripe Sandbox acct_ id (used only for the negative check).
.PARAMETER StartAt          Resume at step N (1-9). Steps are idempotent.
.PARAMETER DryRun           Print what would run; no CLI mutation, no network, no secret prompts.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy-staging.ps1 -ExpectedAccount acct_1UfOqeJJtcRW1Lzi -LocalAccount acct_XXXX
#>
[CmdletBinding()]
param(
  [string]$ProjectRef = 'pvoticdzujmycnnyvdfu',
  [Parameter(Mandatory = $true)][string]$ExpectedAccount,
  [string]$LocalAccount = '',
  [ValidateRange(1, 9)][int]$StartAt = 1,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProdRef = 'fwidhpzwldneeaphrxgg'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Evidence = Join-Path $RepoRoot 'docs\web-launch\L1-EVIDENCE.md'
$Guarded3 = @('stripe-setup', 'stripe-webhook', 'stripe-worker')
$BaseUrl = "https://$ProjectRef.supabase.co"
$TempFiles = New-Object System.Collections.ArrayList
$script:SetupSecret = $null
$stripeKey = $null
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Say([string]$m) { Write-Host $m }
function Step([int]$n, [string]$t) { Write-Host ''; Write-Host "=== Step $n : $t ===" -ForegroundColor Cyan }
function Stop-Here([string]$m) { Write-Host ''; Write-Host "STOP: $m" -ForegroundColor Yellow; throw 'stopped' }
function Wait-Human([string]$m) {
  Write-Host ''; Write-Host $m -ForegroundColor Yellow
  if ($DryRun) { Say '(dry run: continuing)'; return }
  [void](Read-Host 'Press Enter when done, or Ctrl+C to stop')
}
function Add-Evidence([string]$line) {
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss') + 'Z'
  if ($DryRun) { Say "(dry run) evidence: $line"; return }
  if (-not (Test-Path $Evidence)) {
    [System.IO.File]::WriteAllText($Evidence, "# L1 evidence (test project)`r`n`r`nIds, prefixes and counts only. No secret values.`r`n`r`n", $utf8)
  }
  [System.IO.File]::AppendAllText($Evidence, "- $stamp $line`r`n", $utf8)
}
function Read-Secret([string]$prompt) {
  if ($DryRun) { return 'sk_test_DRYRUN' }
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function New-RandomHex([int]$bytes) {
  $buf = New-Object byte[] $bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
  return (($buf | ForEach-Object { $_.ToString('x2') }) -join '')
}

# --- Supabase CLI wrapper -----------------------------------------------------------------------
$sbCmd = Get-Command supabase -ErrorAction SilentlyContinue
function Invoke-Sb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
  if ($DryRun) { Say ("DRYRUN supabase " + ($CliArgs -join ' ')); return }
  if ($sbCmd) { & supabase @CliArgs } else { & npx --yes supabase @CliArgs }
  if ($LASTEXITCODE -ne 0) { Stop-Here ("supabase " + ($CliArgs -join ' ') + " exited with $LASTEXITCODE") }
}

# --- Stripe REST (key stays in memory; used only after the sk_test_/rk_test_ check) -------------
function Get-StripeAccountId([string]$key) {
  if ($DryRun) { return $ExpectedAccount }
  $r = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/account' -Headers @{ Authorization = "Bearer $key" } -Method Get
  return [string]$r.id
}
function Get-WebhookIds([string]$key) {
  if ($DryRun) { return @() }
  $r = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/webhook_endpoints?limit=100' -Headers @{ Authorization = "Bearer $key" } -Method Get
  return @($r.data | ForEach-Object { [string]$_.id } | Sort-Object)
}
function Assert-TestKey([string]$key) {
  if ($key -notmatch '^(sk|rk)_test_[A-Za-z0-9_]+$') { Stop-Here 'The key is not a sk_test_/rk_test_ key (or has stray characters). Live keys never go to this script.' }
}

# --- secrets via a temp env file (deleted in finally) -------------------------------------------
function Set-FunctionSecrets([hashtable]$pairs) {
  if ($DryRun) { Say ("DRYRUN supabase secrets set " + (($pairs.Keys | Sort-Object) -join ', ')); return }
  $f = Join-Path $env:TEMP ("preppa-secrets-" + [guid]::NewGuid().ToString('N') + '.env')
  [void]$TempFiles.Add($f)
  [System.IO.File]::WriteAllText($f, '', $utf8)
  $acl = Get-Acl $f; $acl.SetAccessRuleProtection($true, $false)
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'Allow')))
  Set-Acl $f $acl
  $lines = $pairs.Keys | ForEach-Object { "$_=$($pairs[$_])" }
  [System.IO.File]::WriteAllText($f, (($lines -join "`n") + "`n"), $utf8)
  Invoke-Sb secrets set --env-file $f --project-ref $ProjectRef
  Remove-Item $f -Force; [void]$TempFiles.Remove($f)
}
function New-VaultUpsertSql([System.Collections.IDictionary]$secrets) {
  $parts = foreach ($name in $secrets.Keys) {
    $val = ([string]$secrets[$name]).Replace("'", "''")
    "  select id into v from vault.secrets where name = '$name';`n" +
    "  if v is null then perform vault.create_secret('$val', '$name');`n" +
    "  else perform vault.update_secret(v, '$val'); end if;"
  }
  return "do `$`$ declare v uuid; begin`n" + ($parts -join "`n") + "`nend `$`$;"
}

try {
  # ============================================================================================
  if ($StartAt -le 1) {
    Step 1 'Preflight'
    if ($ProjectRef -eq $ProdRef) { Stop-Here 'That is the PRODUCTION ref. This script only deploys the test project.' }
    if ($ProjectRef -notmatch '^[a-z0-9]{20}$') { Stop-Here 'ProjectRef is not a 20-character Supabase ref.' }
    if ($ExpectedAccount -notmatch '^acct_[A-Za-z0-9]+$') { Stop-Here 'ExpectedAccount must be a bare acct_ id with no spaces.' }
    if ($LocalAccount -ne '' -and $LocalAccount -notmatch '^acct_[A-Za-z0-9]+$') { Stop-Here 'LocalAccount must be a bare acct_ id.' }
    if ($LocalAccount -ne '' -and $LocalAccount -eq $ExpectedAccount) { Stop-Here 'LocalAccount must differ from ExpectedAccount (the negative check needs a different account).' }
    Push-Location $RepoRoot
    try {
      $branch = (& git branch --show-current).Trim()
      Say "Branch: $branch"
      if ($branch -ne 'web-launch-loop0') { Stop-Here "Expected branch web-launch-loop0, found '$branch'. Deploy only reviewed, merged code." }
      $dirty = & git status --porcelain -- supabase scripts
      if ($dirty) { Stop-Here "Uncommitted changes under supabase/ or scripts/:`n$dirty" }
    } finally { Pop-Location }
    if (-not $sbCmd) { Say 'supabase CLI not on PATH; falling back to `npx --yes supabase` (install with `scoop install supabase` for speed). Run `supabase login` first.' }
    if (-not $DryRun) { Invoke-Sb projects list | Out-Null }
    Say "Target ref : $ProjectRef  ($BaseUrl)"
    Say "Production : $ProdRef (refused)"
    if (-not $DryRun) {
      $typed = Read-Host 'Type the project NAME to confirm this is the test project (preppa-test)'
      if ($typed -ne 'preppa-test') { Stop-Here 'Not confirmed.' }
    }
    Add-Evidence "preflight ok: ref $ProjectRef, branch web-launch-loop0, expected account $ExpectedAccount"
  }

  # ============================================================================================
  if ($StartAt -le 2) {
    Step 2 'Link the test project'
    Push-Location $RepoRoot
    try { Invoke-Sb link --project-ref $ProjectRef } finally { Pop-Location }
    Add-Evidence "linked $ProjectRef"
  }

  # ============================================================================================
  if ($StartAt -le 3) {
    Step 3 'Vault secrets (you run this SQL in the Supabase dashboard SQL editor of the TEST project)'
    $script:SetupSecret = New-RandomHex 32
    $workerSecret = New-RandomHex 32
    $sql = New-VaultUpsertSql ([ordered]@{
      'project_base_url'          = $BaseUrl
      'stripe_setup_secret'       = $script:SetupSecret
      'stripe_sync_worker_secret' = $workerSecret
    })
    if ($DryRun) { Say 'DRYRUN: would copy the vault upsert SQL to the clipboard' }
    else {
      Set-Clipboard -Value $sql
      Say 'The SQL is on your clipboard (it holds two freshly generated random secrets; it is not printed or saved).'
    }
    Say "Open https://supabase.com/dashboard/project/$ProjectRef/sql/new , paste, Run. It creates or updates:"
    Say "  project_base_url = $BaseUrl   (no trailing slash; migration 1.2 raises without it)"
    Say '  stripe_setup_secret, stripe_sync_worker_secret   (used by stripe-setup and the cron workers)'
    Say 'Clear your clipboard afterwards. If you resume later with -StartAt, you will be asked for the setup secret.'
    Wait-Human 'Run the SQL on the TEST project, then continue.'
    Add-Evidence 'vault: project_base_url, stripe_setup_secret, stripe_sync_worker_secret created (values not recorded)'
  }
  if ($null -eq $script:SetupSecret -and $StartAt -gt 3 -and $StartAt -le 7) {
    $script:SetupSecret = Read-Secret 'Paste the stripe_setup_secret stored in Vault (hidden)'
  }

  # ============================================================================================
  if ($StartAt -le 7) {
    $stripeKey = Read-Secret 'Paste the preppa-test Sandbox secret key (sk_test_/rk_test_, hidden)'
    if (-not $DryRun) { Assert-TestKey $stripeKey }
  }

  if ($StartAt -le 4) {
    Step 4 'Secrets, then the three guarded Stripe functions'
    Set-FunctionSecrets @{ STRIPE_SECRET_KEY = $stripeKey; STRIPE_EXPECTED_ACCOUNT = $ExpectedAccount }
    Add-Evidence "function secrets set: STRIPE_SECRET_KEY (test key), STRIPE_EXPECTED_ACCOUNT = $ExpectedAccount"
    Push-Location $RepoRoot
    try {
      foreach ($fn in $Guarded3) {
        Invoke-Sb functions deploy $fn --project-ref $ProjectRef --use-api
        Add-Evidence "deployed $fn"
      }
    } finally { Pop-Location }
  }

  # ============================================================================================
  $webhooksBefore = @()
  if ($StartAt -le 5) {
    Step 5 'Verify the key before stripe-setup'
    $prefix = if ($stripeKey.StartsWith('sk_test_')) { 'sk_test_' } else { 'rk_test_' }
    $acct = Get-StripeAccountId $stripeKey
    if ($acct -ne $ExpectedAccount) { Stop-Here "The key belongs to $acct, not $ExpectedAccount. Wrong sandbox key." }
    $webhooksBefore = @(Get-WebhookIds $stripeKey)
    Say "Key prefix $prefix, account $acct matches, $($webhooksBefore.Count) webhook endpoint(s) in the test Sandbox."
    Add-Evidence "key check: prefix $prefix, GET /v1/account = $acct, test webhooks before: $($webhooksBefore -join ',')"
  }
  elseif ($StartAt -le 7) { $webhooksBefore = @(Get-WebhookIds $stripeKey) }

  # ============================================================================================
  $setupUrl = "$BaseUrl/functions/v1/stripe-setup"
  if ($StartAt -le 6) {
    Step 6 'Negative check: stripe-setup must refuse a wrong STRIPE_EXPECTED_ACCOUNT'
    if ($LocalAccount -eq '') {
      Say 'No -LocalAccount given: skipping the negative check. DESIGN step 6 wants it; rerun with -StartAt 6 -LocalAccount acct_... before relying on the guard.'
      Add-Evidence 'negative check SKIPPED (no LocalAccount)'
    } else {
      Set-FunctionSecrets @{ STRIPE_EXPECTED_ACCOUNT = $LocalAccount }
      Say 'Secrets can take a few seconds to reach running isolates; waiting 20 s.'
      if (-not $DryRun) { Start-Sleep -Seconds 20 }
      $status = 0; $body = ''
      if ($DryRun) { $status = 500; $body = '{"error":"Stripe configuration check failed"}' }
      else {
        try {
          $resp = Invoke-WebRequest -Uri $setupUrl -Method Post -Headers @{ Authorization = "Bearer $($script:SetupSecret)" } -UseBasicParsing
          $status = [int]$resp.StatusCode; $body = $resp.Content
        } catch {
          $status = [int]$_.Exception.Response.StatusCode
          $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $body = $sr.ReadToEnd(); $sr.Dispose()
        }
      }
      $after = @(Get-WebhookIds $stripeKey)
      $same = (($after -join ',') -eq ($webhooksBefore -join ','))
      Say "stripe-setup answered HTTP $status : $body"
      Say "Webhook ids unchanged: $same"
      Set-FunctionSecrets @{ STRIPE_EXPECTED_ACCOUNT = $ExpectedAccount }   # restore first, then judge
      Add-Evidence "negative check: HTTP $status, body '$body', webhooks unchanged = $same; STRIPE_EXPECTED_ACCOUNT restored to $ExpectedAccount"
      if ($status -ne 500 -or $body -notmatch 'Stripe configuration check failed') { Stop-Here 'The guard did NOT refuse as expected. Do not run stripe-setup. Investigate first.' }
      if (-not $same) { Stop-Here 'The test Sandbox webhook list changed during the negative check. Investigate first.' }
      Say 'Guard refused before any Stripe call; the correct value is restored. Waiting 20 s for it to propagate.'
      if (-not $DryRun) { Start-Sleep -Seconds 20 }
    }
  }

  # ============================================================================================
  if ($StartAt -le 7) {
    Step 7 'Run stripe-setup on the test project'
    if ($DryRun) { Say "DRYRUN POST $setupUrl" }
    else {
      $resp = Invoke-WebRequest -Uri $setupUrl -Method Post -Headers @{ Authorization = "Bearer $($script:SetupSecret)" } -UseBasicParsing
      Say "stripe-setup answered HTTP $([int]$resp.StatusCode): $($resp.Content)"
      if ([int]$resp.StatusCode -ne 200) { Stop-Here 'stripe-setup did not return 200.' }
    }
    $afterSetup = @(Get-WebhookIds $stripeKey)
    $added = @($afterSetup | Where-Object { $webhooksBefore -notcontains $_ })
    Say "Test Sandbox webhooks added: $($added.Count) ($($added -join ','))"
    Add-Evidence "stripe-setup ok; test webhooks after: $($afterSetup -join ','); added: $($added -join ',')"
    Say 'This script only holds the test key, so the live account is never touched. Confirm in the live dashboard that its webhook list is unchanged.'
    $stripeKey = $null; $script:SetupSecret = $null
  }

  # ============================================================================================
  if ($StartAt -le 8) {
    Step 8 'Migrations'
    Say 'supabase db push applies every migration. Migration 1.2 raises if Vault project_base_url is missing (that is the loud failure).'
    Say 'It may ask for the database password: Project Settings > Database in the dashboard.'
    Push-Location $RepoRoot
    try { Invoke-Sb db push --linked } finally { Pop-Location }
    Add-Evidence 'db push finished'
    Say ''
    Say 'Now run this in the TEST project SQL editor, twice, then the check:'
    Say '  select public.install_stripe_reconcile_triggers();'
    Say '  select public.install_stripe_reconcile_triggers();'
    Say '  select public.check_stripe_reconcile_triggers();   -- expect {}'
    Wait-Human 'Run the statements and confirm check_stripe_reconcile_triggers() returns an empty array.'
    Add-Evidence 'install_stripe_reconcile_triggers run twice; check_stripe_reconcile_triggers() confirmed empty by operator'
  }

  # ============================================================================================
  if ($StartAt -le 9) {
    Step 9 'Remaining functions, one at a time (the 26 guarded callers must not go out all at once)'
    $fnRoot = Join-Path $RepoRoot 'supabase\functions'
    $all = @(Get-ChildItem $fnRoot -Directory | ForEach-Object { $_.Name } | Where-Object { $Guarded3 -notcontains $_ } | Sort-Object)
    $first = @('create-order', 'decline-order') | Where-Object { $all -contains $_ }
    $rest = @($all | Where-Object { $first -notcontains $_ })
    $order = @($first) + $rest
    Say "$($order.Count) functions to deploy."
    Push-Location $RepoRoot
    try {
      $n = 0
      foreach ($fn in $order) {
        $n++
        Say "[$n/$($order.Count)] $fn"
        Invoke-Sb functions deploy $fn --project-ref $ProjectRef --use-api
        Add-Evidence "deployed $fn"
        if ($fn -eq 'decline-order') {
          Wait-Human 'create-order and decline-order are up. Smoke-test checkout and decline-refund on staging now if you want to, before the rest go out.'
        }
      }
    } finally { Pop-Location }
    Say ''
    Say 'Not set by this script (set later only if you test those features): MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET.'
    Say 'Run `supabase secrets list --project-ref <ref>` to confirm STRIPE_SECRET_KEY and STRIPE_EXPECTED_ACCOUNT exist.'
  }

  Say ''
  Say 'Done. Evidence appended to docs/web-launch/L1-EVIDENCE.md (ids only). Review it before committing.'
}
catch {
  if ($_.Exception.Message -ne 'stopped') { Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red; exit 1 }
  exit 2
}
finally {
  foreach ($f in $TempFiles) { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } }
  $stripeKey = $null
}
