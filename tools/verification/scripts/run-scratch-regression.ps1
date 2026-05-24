[CmdletBinding()]
param(
    [string]$ScratchExe = 'C:\Users\Administrator\AppData\Local\Programs\Scratch 3\Scratch 3.exe',
    [int]$TimeoutMs = 20000,
    [int]$PayloadTimeoutMs = 30000,
    [int]$PostActionPayloadTimeoutMs = 12000,
    [int]$PostActionSettleMs = 2500,
    [int]$InjectionAttempts = 5,
    [int]$InjectionSettleMs = 6000
)

$ErrorActionPreference = 'Stop'

function Stop-ScratchProcesses {
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -like 'Scratch*' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

function Invoke-BridgeCase {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [string[]]$ExtraArgs = @()
    )

    Stop-ScratchProcesses

    $args = @(
        'tools/verification\scripts\verify-scratch-bridge.mjs',
        "--exe=$ScratchExe",
        '--kill-on-exit',
        "--timeout-ms=$TimeoutMs",
        "--payload-timeout-ms=$PayloadTimeoutMs",
        "--post-action-payload-timeout-ms=$PostActionPayloadTimeoutMs",
        "--post-action-settle-ms=$PostActionSettleMs",
        "--injection-attempts=$InjectionAttempts",
        "--injection-settle-ms=$InjectionSettleMs"
    ) + $ExtraArgs

    $raw = & node @args
    if ($LASTEXITCODE -ne 0) {
        throw "Case [$Name] failed to execute."
    }

    $parsed = $raw | ConvertFrom-Json
    [PSCustomObject]@{
        Name = $Name
        Result = $parsed
    }
}

function Assert-Contains {
    param(
        [string[]]$Values,
        [string]$Expected,
        [string]$Message
    )

    if (-not $Values -or $Expected -notin $Values) {
        throw $Message
    }
}

function Assert-EmptyOrNull {
    param(
        [object[]]$Values,
        [string]$Message
    )

    if ($Values -and $Values.Count -gt 0) {
        throw $Message
    }
}

function Assert-ProgramAreaContains {
    param(
        [object[]]$Modules,
        [string]$ExpectedId,
        [string]$Message
    )

    if (-not $Modules) {
        throw $Message
    }

    $moduleIds = @($Modules | ForEach-Object { $_.id })
    if ($ExpectedId -notin $moduleIds) {
        throw $Message
    }
}

$cases = @(
    @{ Name = 'baseline'; ExtraArgs = @() },
    @{ Name = 'music-loaded'; ExtraArgs = @('--load-extension=music') },
    @{ Name = 'pen-used'; ExtraArgs = @('--add-block-opcode=pen_clear') },
    @{ Name = 'translate-used'; ExtraArgs = @('--add-block-opcode=translate_getViewerLanguage') }
)

$results = foreach ($case in $cases) {
    Invoke-BridgeCase -Name $case.Name -ExtraArgs $case.ExtraArgs
}

$baseline = $results | Where-Object Name -eq 'baseline' | Select-Object -ExpandProperty Result
if (-not $baseline.payload.toolboxCategories -or $baseline.payload.toolboxCategories.Count -lt 5) {
    throw 'Baseline case did not report toolbox categories.'
}
$baselineToolboxCount = $baseline.payload.toolboxCategories.Count

$music = $results | Where-Object Name -eq 'music-loaded' | Select-Object -ExpandProperty Result
Assert-Contains -Values $music.payload.loadedExtensions -Expected 'music' -Message 'Music case did not load the music extension.'
if (-not $music.payload.currentTargetName) {
    throw 'Music case did not report currentTargetName.'
}
if (-not $music.payload.toolboxCategories -or $music.payload.toolboxCategories.Count -le $baselineToolboxCount) {
    throw 'Music case did not expand the toolbox categories.'
}
Assert-EmptyOrNull -Values $music.payload.usedExtensions -Message 'Music case should not mark music as used before any block is inserted.'
Assert-EmptyOrNull -Values $music.payload.programAreaModules -Message 'Music case should not report program-area modules before any block is inserted.'

$pen = $results | Where-Object Name -eq 'pen-used' | Select-Object -ExpandProperty Result
Assert-Contains -Values $pen.payload.loadedExtensions -Expected 'pen' -Message 'Pen case did not load the pen extension.'
Assert-Contains -Values $pen.payload.usedExtensions -Expected 'pen' -Message 'Pen case did not mark pen as used.'
Assert-ProgramAreaContains -Modules $pen.payload.programAreaModules -ExpectedId 'pen' -Message 'Pen case did not report the pen module in the program area.'
if (-not $pen.payload.currentTargetName) {
    throw 'Pen case did not report currentTargetName.'
}
if (-not $pen.payload.toolboxCategories -or $pen.payload.toolboxCategories.Count -le $baselineToolboxCount) {
    throw 'Pen case did not expand the toolbox categories.'
}

$translate = $results | Where-Object Name -eq 'translate-used' | Select-Object -ExpandProperty Result
Assert-Contains -Values $translate.payload.loadedExtensions -Expected 'translate' -Message 'Translate case did not load the translate extension.'
Assert-Contains -Values $translate.payload.usedExtensions -Expected 'translate' -Message 'Translate case did not mark translate as used.'
Assert-ProgramAreaContains -Modules $translate.payload.programAreaModules -ExpectedId 'translate' -Message 'Translate case did not report the translate module in the program area.'
if (-not $translate.payload.currentTargetName) {
    throw 'Translate case did not report currentTargetName.'
}
if (-not $translate.payload.toolboxCategories -or $translate.payload.toolboxCategories.Count -le $baselineToolboxCount) {
    throw 'Translate case did not expand the toolbox categories.'
}

$summary = $results | ForEach-Object {
    [PSCustomObject]@{
        Case = $_.Name
        Source = $_.Result.payload.source
        CurrentTarget = $_.Result.payload.currentTargetName
        ProgramAreaModules = (
            @($_.Result.payload.programAreaModules | ForEach-Object {
                if ($_.label -and $_.blockCount) {
                    "$($_.label)($($_.blockCount))"
                }
                elseif ($_.id) {
                    $_.id
                }
            }) -join ', '
        )
        ToolboxCategories = ($_.Result.payload.toolboxCategories -join ', ')
        LoadedExtensions = ($_.Result.payload.loadedExtensions -join ', ')
        UsedExtensions = ($_.Result.payload.usedExtensions -join ', ')
    }
}

$summary | Format-Table -AutoSize
