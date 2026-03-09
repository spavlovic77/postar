# ============================================================
# Test PFS Verification Webhook
# Usage: .\scripts\test-pfs-webhook.ps1
# ============================================================

# --- Configuration (edit these) ---
$appUrl  = "https://postar-six.vercel.app"
$secret  = "9fB2kL8vT5rPqX3mW7nJ4cZ6eA1tD0g"
$dic     = "1234567890"
$token   = "test-token-123"
# ----------------------------------

# Body must match the PfsVerificationPayload interface
$body = "{`"event_type`":`"company_verified`",`"dic`":`"$dic`",`"verification_token`":`"$token`",`"timestamp`":`"$(Get-Date -Format o)`"}"

# Write body to temp file (ensures identical bytes for signature and curl)
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $body, [System.Text.Encoding]::UTF8)

# Compute HMAC-SHA256 signature over raw body
$hmac      = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key  = [Text.Encoding]::UTF8.GetBytes($secret)
$bodyBytes = [System.IO.File]::ReadAllBytes($tempFile)
# Strip UTF-8 BOM if present (3 bytes: EF BB BF)
if ($bodyBytes.Length -ge 3 -and $bodyBytes[0] -eq 0xEF -and $bodyBytes[1] -eq 0xBB -and $bodyBytes[2] -eq 0xBF) {
    $bodyBytes = $bodyBytes[3..($bodyBytes.Length - 1)]
    [System.IO.File]::WriteAllBytes($tempFile, $bodyBytes)
}
$sig = [BitConverter]::ToString(
            $hmac.ComputeHash($bodyBytes)
         ).Replace("-","").ToLower()

Write-Host "--- PFS Webhook Test ---"
Write-Host "URL:       $appUrl/api/webhooks/pfs/verification"
Write-Host "Signature: $sig"
Write-Host "Body:      $body"
Write-Host "------------------------"

# Send request using temp file to guarantee byte-for-byte match
curl.exe -X POST "$appUrl/api/webhooks/pfs/verification" `
  -H "Content-Type: application/json" `
  -H "X-PFS-Signature: $sig" `
  --data-binary "@$tempFile"

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host ""
