# ============================================================
# Test ION AP - Add Identifier to Organization
# Usage: .\scripts\test-ion-add-identifier.ps1
# ============================================================

# --- Configuration (edit these) ---
$orgId  = 500
$apiUrl = "https://test.ion-ap.net/api/v2/organizations/$orgId/identifiers"
$token  = "adba439948539073c0bdb9873206ea8bc34999fc"
$dic    = "1234567890"
# ----------------------------------

$body = @"
{
  "identifier": "0245:$dic",
  "verified": true,
  "publish_receive_peppolbis": true,
  "publish_receive_nlcius": true,
  "publish_receive_invoice_response": true
}
"@

Write-Host "--- ION AP Add Identifier ---"
Write-Host "URL:  $apiUrl"
Write-Host "Body: $body"
Write-Host "-----------------------------"

# Write to temp file to avoid PowerShell stripping quotes
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $body, (New-Object System.Text.UTF8Encoding $false))

curl.exe -X POST $apiUrl `
  -H "Authorization: Token $token" `
  -H "Content-Type: application/json" `
  --data-binary "@$tempFile"

Remove-Item $tempFile -ErrorAction SilentlyContinue
Write-Host ""
