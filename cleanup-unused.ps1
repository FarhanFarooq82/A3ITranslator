# Script to remove unused files and backups

# Define files to be removed
$filesToRemove = @(
    # Backup/duplicate files
    ".\frontend\src\components\RealTimeTranslatorApp.tsx.bak",
    ".\frontend\src\components\RealTimeTranslatorApp.new.tsx",
    ".\frontend\src\hooks\useRecording.fixed.ts",
    
    # Unused component files
    ".\frontend\src\components\ControlButtons.tsx",
    ".\frontend\src\components\ReplayButton.tsx",
    ".\frontend\src\components\MessageItem.tsx",
    ".\frontend\src\components\InstructionDisplay.tsx",
    
    # Old scripts
    ".\cleanup-script.ps1"
)

# Show file list
Write-Host "Starting removal of unused files and backups..." -ForegroundColor Yellow
Write-Host "Files to be removed:" -ForegroundColor Yellow
foreach ($file in $filesToRemove) {
    Write-Host "  - $file" -ForegroundColor Cyan
}

# Process each file
foreach ($file in $filesToRemove) {
    if (Test-Path -Path $file) {
        Write-Host "Removing $file..." -ForegroundColor Yellow
        Remove-Item -Path $file -Force
        if (-not (Test-Path -Path $file)) {
            Write-Host "Successfully removed $file" -ForegroundColor Green
        } else {
            Write-Host "Failed to remove $file" -ForegroundColor Red
        }
    } else {
        Write-Host "File not found: $file" -ForegroundColor DarkYellow
    }
}

Write-Host "Cleanup completed!" -ForegroundColor Green
