# build/build-win.ps1
# 用途：在受限/沙箱化构建宿主（如 AI 智能体会话）中执行 Windows 打包。
#
# 背景（2026-11-15 ET-1 修复记录，详见 out/tool-results/build-r1-diagnosis.log）：
#   electron-builder 26 生成 NSIS 安装包时，需要先编译并“运行”一个中间安装器
#   （BUILD_UNINSTALLER 模式）来生成 __uninstaller.exe。若该中间安装器运行时的
#   临时目录不可用，NSIS 会弹窗：
#     "Error writing temporary file. Make sure your temp folder is valid."
#   随后 electron-builder 报：
#     dist\BaiZeNotes_Setup_1.2.2_windows_x64.exe process failed 2
#   实测表明：把 TEMP/TMP 指向工作区内目录（out/tmp/build-temp）即可正常构建；
#   系统默认 %TEMP%（C:\Users\<user>\AppData\Local\Temp）在该类宿主中会失败。
#
# 用法（在仓库根目录或任意位置均可）：
#   powershell -ExecutionPolicy Bypass -File build/build-win.ps1 -Target nsis
#   powershell -ExecutionPolicy Bypass -File build/build-win.ps1 -Target portable
#   powershell -ExecutionPolicy Bypass -File build/build-win.ps1 -Target unpack
#   powershell -ExecutionPolicy Bypass -File build/build-win.ps1 -Target all
#
# 说明：普通桌面终端直接执行 npm run build:win:nsis 通常无需本脚本；
#       只有在默认 %TEMP% 下 NSIS 报上述错误时才需要。

param(
    [ValidateSet('nsis', 'portable', 'unpack', 'all')]
    [string]$Target = 'nsis'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$tempDir = Join-Path $root 'out\tmp\build-temp'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$oldTemp = $env:TEMP
$oldTmp = $env:TMP
$oldTmpDir = $env:TMPDIR

function Invoke-NpmScript([string]$scriptName) {
    Write-Host "[build-win] npm run $scriptName (TEMP=$env:TEMP)" -ForegroundColor Cyan
    # 用 cmd 调用，避免 PowerShell 执行策略阻止 npm.ps1
    cmd /c "npm run $scriptName"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[build-win] npm run $scriptName 失败，exit=$LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

try {
    $env:TEMP = $tempDir
    $env:TMP = $tempDir
    $env:TMPDIR = $tempDir

    switch ($Target) {
        'unpack' { Invoke-NpmScript 'build:unpack' }
        'nsis' { Invoke-NpmScript 'build:win:nsis' }
        'portable' { Invoke-NpmScript 'build:win:portable' }
        'all' {
            Invoke-NpmScript 'build:win:nsis'
            Invoke-NpmScript 'build:win:portable'
        }
    }
    Write-Host "[build-win] 完成：$Target" -ForegroundColor Green
}
finally {
    $env:TEMP = $oldTemp
    $env:TMP = $oldTmp
    $env:TMPDIR = $oldTmpDir
}
