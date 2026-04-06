param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Plan,

  [Parameter(Position = 1)]
  [string]$Reference = "buyer"
)

$LICENSE_SECRET = "APHELION::KITSUNE::2026"
$LICENSE_VERSION = "APH1"

function Convert-ToBase36([long]$Number) {
  $chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  if ($Number -eq 0) { return "0" }

  $result = ""
  while ($Number -gt 0) {
    $remainder = [int]($Number % 36)
    $result = $chars[$remainder] + $result
    $Number = [math]::Floor($Number / 36)
  }

  return $result
}

function Get-Seed([string]$Text) {
  $raw = $Text.ToUpper()
  $acc = 11

  for ($i = 0; $i -lt $raw.Length; $i++) {
    $acc = (($acc * 29) + ([int][char]$raw[$i]) * ($i + 1)) % 1679616
  }

  $value = (Convert-ToBase36 $acc).ToUpper().PadLeft(4, '0')
  return $value.Substring($value.Length - 4)
}

function Get-LicenseChecksum([string]$Seed) {
  $raw = "$Seed|$LICENSE_SECRET"
  $acc = 17

  for ($i = 0; $i -lt $raw.Length; $i++) {
    $acc = (($acc * 31) + ([int][char]$raw[$i]) * ($i + 3)) % 1679616
  }

  $value = (Convert-ToBase36 $acc).ToUpper().PadLeft(4, '0')
  return $value.Substring($value.Length - 4)
}

function New-LicenseKey([string]$PlanName, [string]$BuyerReference) {
  switch ($PlanName.ToLower()) {
    "unlimited-bonk" { $code = "UNL" }
    "unlimited" { $code = "UNL" }
    "noads" { $code = "KIT" }
    "no-ads-kitsune" { $code = "KIT" }
    "bundle" { $code = "MAX" }
    "founder" { $code = "MAX" }
    default { throw "Unknown plan. Use: unlimited-bonk, noads, or bundle" }
  }

  $seed = Get-Seed $BuyerReference
  $checksum = Get-LicenseChecksum "$LICENSE_VERSION-$code-$seed"
  return "$LICENSE_VERSION-$code-$seed-$checksum"
}

function Test-LicenseKey([string]$Key) {
  $clean = ($Key.ToUpper() -replace '[^A-Z0-9]', '')
  if ($clean.Length -ne 15) { return $false }
  if ($clean -notmatch '^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$') { return $false }

  $code = $Matches[1]
  $seed = $Matches[2]
  $checksum = $Matches[3]
  return (Get-LicenseChecksum "$LICENSE_VERSION-$code-$seed") -eq $checksum
}

if ($Plan.ToLower() -eq "verify") {
  $ok = Test-LicenseKey $Reference
  if ($ok) {
    Write-Output "VALID"
    exit 0
  }

  Write-Output "INVALID"
  exit 1
}

$key = New-LicenseKey $Plan $Reference
Write-Output "Plan: $Plan"
Write-Output "Key: $key"
Write-Output ""
Write-Output "Examples:"
Write-Output "  .\license-tools.ps1 unlimited-bonk alice@example.com"
Write-Output "  .\license-tools.ps1 noads order_1042"
Write-Output "  .\license-tools.ps1 verify APH1-UNL-XXXX-YYYY"
