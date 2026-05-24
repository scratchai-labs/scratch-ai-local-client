param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$removedPaths = New-Object System.Collections.Generic.List[string]
$failedPaths = New-Object System.Collections.Generic.List[string]

function Get-RelativePath {
    param(
        [string]$FullPath
    )

    if ($FullPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $FullPath.Substring($repoRoot.Length).TrimStart("\", "/")
        if ($relative) {
            return $relative
        }
    }

    return $FullPath
}

function Remove-Matches {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo[]]$Items
    )

    foreach ($item in $Items) {
        $relativePath = Get-RelativePath -FullPath $item.FullName

        if ($DryRun) {
            Write-Host "[dry-run] remove $relativePath"
            continue
        }

        $removeError = $null
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                Remove-Item -LiteralPath $item.FullName -Recurse -Force
                $removeError = $null
                break
            }
            catch {
                $removeError = $_
                if ($attempt -lt 5) {
                    Start-Sleep -Seconds 2
                }
            }
        }

        if ($removeError) {
            $failedPaths.Add($relativePath) | Out-Null
            Write-Warning "Could not remove $relativePath after multiple attempts: $($removeError.Exception.Message)"
            continue
        }

        $removedPaths.Add($relativePath) | Out-Null
        Write-Host "[removed] $relativePath"
    }
}

function Remove-PathIfExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $fullPath = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath)) {
        return
    }

    $item = Get-Item -Force -LiteralPath $fullPath
    Remove-Matches -Items @($item)
}

function Remove-GlobIfExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePattern
    )

    $pattern = Join-Path $repoRoot $RelativePattern
    $items = @(Get-ChildItem -Force -Path $pattern -ErrorAction SilentlyContinue)
    if ($items.Count -eq 0) {
        return
    }

    Remove-Matches -Items $items
}

Remove-PathIfExists -RelativePath "node_modules"
Remove-PathIfExists -RelativePath "packages/shared/node_modules"
Remove-PathIfExists -RelativePath "tools/verification/node_modules"
Remove-PathIfExists -RelativePath "apps/desktop-companion/node_modules"
Remove-PathIfExists -RelativePath "apps/desktop-companion/dist"
Remove-PathIfExists -RelativePath "apps/desktop-companion/release-single"
Remove-PathIfExists -RelativePath "apps/desktop-companion/release-installer"
Remove-PathIfExists -RelativePath "apps/desktop-companion/release-bundles"
Remove-GlobIfExists -RelativePattern "apps/desktop-companion/release-mac*"
Remove-GlobIfExists -RelativePattern "apps/desktop-companion/release-dmg*"
Remove-PathIfExists -RelativePath "tools/verification/artifacts"
Remove-PathIfExists -RelativePath "tools/verification/generated"

Remove-GlobIfExists -RelativePattern "tools/verification/tmp-*"
Remove-GlobIfExists -RelativePattern "tools/verification/last-*.json"
Remove-GlobIfExists -RelativePattern "docs/assets/screenshots/*.png"

$installerRoot = Join-Path $repoRoot "installers"
if (Test-Path -LiteralPath $installerRoot) {
    $installerItems = @(
        Get-ChildItem -Force -LiteralPath $installerRoot |
            Where-Object { $_.Name -ne ".gitkeep" }
    )

    if ($installerItems.Count -gt 0) {
        Remove-Matches -Items $installerItems
    }
}

if ($DryRun) {
    Write-Host "Dry run finished."
    exit 0
}

if ($failedPaths.Count -gt 0) {
    if ($removedPaths.Count -gt 0) {
        Write-Host "Removed $($removedPaths.Count) generated workspace artifact(s)."
    }
    Write-Warning "Still locked or unavailable: $($failedPaths -join ', ')"
    exit 1
}

if ($removedPaths.Count -eq 0) {
    Write-Host "No generated workspace artifacts were found."
    exit 0
}

Write-Host "Removed $($removedPaths.Count) generated workspace artifact(s)."
