# AnnexLK Backup Automation Script for local development or Windows VPS
# Usage: powershell -File scripts/backup.ps1

$ErrorActionPreference = "Stop"

# 1. Load Environment Variables from .env
$envFile = Join-Path $PSScriptRoot "../.env"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables..."
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $key, $value = $line -split '=', 2
            if ($key -and $value) {
                $envKey = $key.Trim()
                $envVal = $value.Trim()
                [System.Environment]::SetEnvironmentVariable($envKey, $envVal)
            }
        }
    }
}

# 2. Configuration Parameters
$dbHost = [System.Environment]::GetEnvironmentVariable("DB_HOST")
$dbName = [System.Environment]::GetEnvironmentVariable("DB_NAME")
$dbUser = [System.Environment]::GetEnvironmentVariable("DB_USER")
$dbPass = [System.Environment]::GetEnvironmentVariable("DB_PASSWORD")

$backupDir = Join-Path $PSScriptRoot "../backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "annexlk-backup-$timestamp"
$targetBackupDir = Join-Path $backupDir $archiveName

# Ensure directories exist
New-Item -ItemType Directory -Force -Path $targetBackupDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $targetBackupDir "storage") | Out-Null

Write-Host "Starting backup process..."
Write-Host "Backup directory: $targetBackupDir"

# 3. Database Dump (uses mysqldump if available)
$dumpFile = Join-Path $targetBackupDir "database.sql"
if (Get-Command mysqldump -ErrorAction SilentlyContinue) {
    Write-Host "Running database backup using mysqldump..."
    if ($dbPass) {
        mysqldump -h $dbHost -u $dbUser -p"$dbPass" $dbName > $dumpFile
    } else {
        mysqldump -h $dbHost -u $dbUser $dbName > $dumpFile
    }
} else {
    Write-Host "WARNING: 'mysqldump' not found in path. Creating placeholder database.sql."
    "/* Database dump placeholder. Install MariaDB CLI tool to automate full dumps. */" | Out-File $dumpFile
}

# 4. Copy storage assets
Write-Host "Copying listing images and KYC files..."
$publicStorage = Join-Path $PSScriptRoot "../storage/public"
$privateStorage = Join-Path $PSScriptRoot "../storage/private"

if (Test-Path $publicStorage) {
    Copy-Item -Path $publicStorage -Destination (Join-Path $targetBackupDir "storage") -Recurse -Force
}
if (Test-Path $privateStorage) {
    Copy-Item -Path $privateStorage -Destination (Join-Path $targetBackupDir "storage") -Recurse -Force
}

# 5. Compress full backup folder
Write-Host "Compressing backup archive..."
$zipPath = Join-Path $backupDir "$archiveName.zip"
Compress-Archive -Path $targetBackupDir -DestinationPath $zipPath

# Clean up temp folder structure
Remove-Item -Path $targetBackupDir -Recurse -Force

Write-Host "Backup created successfully at: $zipPath"

# 6. Retention Manager: Keep only last 7 archives
Write-Host "Cleaning up old backups (retention: 7 files)..."
$backups = Get-ChildItem -Path $backupDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending
if ($backups.Count -gt 7) {
    $backups | Select-Object -Skip 7 | ForEach-Object {
        Write-Host "Deleting old backup: $_.Name"
        Remove-Item $_.FullName -Force
    }
}

Write-Host "Retention cleanup done."
