# 破釜 · 本地开发一键启动脚本
# 用法：./scripts/dev.ps1（或 powershell -ExecutionPolicy Bypass -File scripts/dev.ps1）
# 流程：检查 Node 版本 → 缺依赖时自动安装(根目录 + backend) → 缺 .env 时从示例复制 → npm run dev

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

# ---- 1. Node 版本：node:sqlite 需要 >= 22.5（推荐 24+）----
Step '检查 Node.js 版本'
try { $nv = & node --version } catch {
    Fail '未找到 node，请先安装 Node.js 24：https://nodejs.org'
}
$v = ($nv -replace '^v', '').Split('.')
$major = [int]$v[0]; $minor = [int]$v[1]
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 5)) {
    Fail "Node $nv 过旧：node:sqlite 需要 >= 22.5（推荐 24+），请升级 https://nodejs.org"
}
Write-Host "Node $nv OK"

# ---- 2. 依赖：node_modules 缺了才装，避免每次启动都跑 npm install ----
if (-not (Test-Path "$Root\node_modules")) {
    Step '安装前端依赖（首次较慢）'
    Push-Location $Root
    & npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail '前端依赖安装失败' }
}
if (-not (Test-Path "$Root\backend\node_modules")) {
    Step '安装后端依赖'
    Push-Location "$Root\backend"
    & npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail '后端依赖安装失败' }
}

# ---- 3. .env：首次从 .env.example 复制；缺它也能跑，但注册邀请码/创始人账号就用默认值了 ----
if (-not (Test-Path "$Root\.env") -and (Test-Path "$Root\.env.example")) {
    Step '初始化 .env'
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host '已从 .env.example 创建 .env，邀请码/创始人密码等按需修改（.env 已 gitignore）'
}

# ---- 4. 启动：vite(9527，/api 代理到 9528) + 后端(9528) ----
Step '启动开发服务（Ctrl+C 退出）'
Write-Host '前端  http://localhost:9527'
Write-Host 'API    http://localhost:9528'
Push-Location $Root
& npm run dev
$code = $LASTEXITCODE
Pop-Location
exit $code
