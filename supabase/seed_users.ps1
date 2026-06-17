param(
  [string]$SupabaseUrl = "https://gedvhtaiobzczdypdvkl.supabase.co",
  [string]$ServiceRoleKey = $(throw "-ServiceRoleKey is required"),
  [string]$Password = "20040701@Dd"
)

$ErrorActionPreference = "Stop"
$headers = @{ "apikey" = $ServiceRoleKey; "Authorization" = "Bearer $ServiceRoleKey"; "Content-Type" = "application/json" }

# 1. Delete existing broken seed users (auth + profiles via REST)
Write-Host "Cleaning up old seed users..." -ForegroundColor Yellow
try {
  $deleteRes = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/rpc/delete_seed_auth_users" -Method Post -Headers $headers -SkipCertificateCheck -ErrorAction Stop
} catch {
  $deleteRes = $null
}
if (-not $deleteRes) {
  # Fallback: delete profiles and auth users separately via SQL approach
  Write-Host "  (direct SQL cleanup needed - run the SQL below in Supabase SQL Editor)"
}

# 2. Create seed users via Auth Admin API (this ensures correct pw hashing)
$users = @(
  @{ email = "admin@marianbridge.test"; role = "admin"; username = "admin"; full_name = "Admin User" }
  @{ email = "captain@marianbridge.test"; role = "captain"; username = "captain"; full_name = "Captain User" }
  @{ email = "charter-party@marianbridge.test"; role = "charter_party"; username = "charter_party"; full_name = "Charter Party User" }
  @{ email = "ship-agent@marianbridge.test"; role = "ship_agent"; username = "ship_agent"; full_name = "Ship Agent User" }
  @{ email = "port-authority@marianbridge.test"; role = "port_authority"; username = "port_authority"; full_name = "Port Authority User" }
)

function Create-SupabaseUser {
  param($User)
  $body = @{
    email = $User.email
    password = $Password
    email_confirm = $true
    user_metadata = @{
      role = $User.role
      username = $User.username
      full_name = $User.full_name
    }
  } | ConvertTo-Json -Depth 5

  try {
    $result = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users" -Method Post -Body $body -ContentType "application/json" -Headers $headers -SkipCertificateCheck
    Write-Host "  Created $($User.email)" -ForegroundColor Green
    return $result
  } catch {
    $err = $_.Exception.Response
    if ($err.StatusCode -eq 409) {
      Write-Host "  $($User.email) already exists, skipping" -ForegroundColor Yellow
      return $null
    }
    Write-Host "  FAILED $($User.email): $_" -ForegroundColor Red
    return $null
  }
}

Write-Host "Creating seed users..." -ForegroundColor Yellow
foreach ($u in $users) {
  Create-SupabaseUser -User $u
}

# 3. Get service categories for supplier creation
$cats = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/service_categories?select=id,name&order=name" -Method Get -Headers $headers -SkipCertificateCheck
$seq = 0
foreach ($cat in $cats) {
  $seq++
  $supplierEmail = "supplier$seq@marianbridge.test"
  $supplierUsername = "supplier_" + ($cat.name -replace ' & ', '_').ToLower()
  $supplierBody = @{
    email = $supplierEmail
    password = $Password
    email_confirm = $true
    user_metadata = @{
      role = "supplier"
      username = $supplierUsername
      full_name = "$($cat.name) Supplier"
      company_name = "$($cat.name) Co"
      business_no = "BN-$(($seq).ToString('000'))"
      duns_no = "DUNS-$(($seq).ToString('000'))"
      service_category_id = $cat.id
    }
  } | ConvertTo-Json -Depth 5

  try {
    $result = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users" -Method Post -Body $supplierBody -ContentType "application/json" -Headers $headers -SkipCertificateCheck
    Write-Host "  Created $supplierEmail" -ForegroundColor Green
  } catch {
    $err = $_.Exception.Response
    if ($err.StatusCode -eq 409) {
      Write-Host "  $supplierEmail already exists, skipping" -ForegroundColor Yellow
    } else {
      Write-Host "  FAILED ${supplierEmail}: $_" -ForegroundColor Red
    }
  }
}

# 4. Mark all seed profiles as verified + update role-specific fields
Write-Host "`nNow run the following SQL in Supabase SQL Editor to mark profiles verified:" -ForegroundColor Cyan
Write-Host @"
-- Clean up broken auth+profile pairs from old SQL seed
delete from public.profiles where email like '%@marianbridge.test';
-- (auth users will cascade)

-- Then verify the new seed profiles
update public.profiles set verified = true where email like '%@marianbridge.test';

-- Verify
select p.username, p.role, p.email, p.verified
from public.profiles p
where p.email like '%@marianbridge.test'
order by p.role;
"@ -ForegroundColor White
