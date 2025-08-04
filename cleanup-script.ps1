# Script to remove deprecated files after refactoring
# This script will remove files that are no longer needed following the refactoring

# List of files to be removed
$filesToRemove = @(
    ".\frontend\src\context\TranslationContext.tsx",
    ".\frontend\src\context\translationContext.utils.ts",
    ".\frontend\src\hooks\useSessionManager.ts",
    ".\frontend\src\hooks\useConversationManager.ts",
    ".\frontend\src\hooks\useRecordingManager.ts",
    ".\frontend\src\hooks\useAudioRecording.ts"
)

# Function to remove a file with confirmation
function Remove-FileWithConfirmation {
    param (
        [string]$filePath
    )
    
    if (Test-Path $filePath) {
        Write-Host "Removing $filePath..." -ForegroundColor Yellow
        Remove-Item $filePath
        Write-Host "File removed successfully." -ForegroundColor Green
    } else {
        Write-Host "File not found: $filePath" -ForegroundColor Red
    }
}

# Main execution
Write-Host "Starting cleanup of deprecated files..." -ForegroundColor Blue
Write-Host "The following files will be removed:" -ForegroundColor Yellow
$filesToRemove | ForEach-Object { Write-Host "  - $_" }

$confirmation = Read-Host "Do you want to proceed with removal? (y/n)"

if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    foreach ($file in $filesToRemove) {
        Remove-FileWithConfirmation -filePath $file
    }
    
    Write-Host "Cleanup completed successfully!" -ForegroundColor Green
    Write-Host "All deprecated files have been removed from the project." -ForegroundColor Green
} else {
    Write-Host "Cleanup cancelled. No files were removed." -ForegroundColor Yellow
}
}
