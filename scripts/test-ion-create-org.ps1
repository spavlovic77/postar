# ============================================================
# Test ION AP - Create Organization
# Usage: .\scripts\test-ion-create-org.ps1
# ============================================================

# --- Configuration (edit these) ---
$apiUrl = "https://test.ion-ap.net/api/v2/organizations"
$token  = "adba439948539073c0bdb9873206ea8bc34999fc"
# ----------------------------------

$body = @'
{
  "name": "Company a.s.",
  "country": "SK",
  "publish_in_smp": true,
  "reference": "rerefencia"
}
'@

Write-Host "--- ION AP Create Organization ---"
Write-Host "URL:  $apiUrl"
Write-Host "Body: $body"
Write-Host "----------------------------------"

# Write to temp file to avoid PowerShell stripping quotes
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $body, (New-Object System.Text.UTF8Encoding $false))

curl.exe -X POST $apiUrl `
  -H "Authorization: Token $token" `
  -H "Content-Type: application/json" `
  --data-binary "@$tempFile"

Remove-Item $tempFile -ErrorAction SilentlyContinue
Write-Host ""
