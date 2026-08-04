# Assemble a self-contained Hugging Face Docker Space bundle for the
# skills-over-mcp demo server: server source + demo skills + Dockerfile +
# Space README, staged under hf-space/.staging (git-ignored).
#
#   ./assemble.ps1                 # stage into ./.staging
#   ./assemble.ps1 -Staging <dir>  # stage into a custom dir
param(
  [string]$Staging
)
$ErrorActionPreference = "Stop"

$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $here "..")

if (-not $Staging) { $Staging = Join-Path $here ".staging" }

# Fresh staging dir.
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Force -Path $Staging | Out-Null

# Server source (no node_modules/dist - the image installs and builds).
foreach ($f in @("package.json", "package-lock.json", "tsconfig.json")) {
  Copy-Item (Join-Path $repoRoot $f) (Join-Path $Staging $f)
}
Copy-Item (Join-Path $repoRoot "src") (Join-Path $Staging "src") -Recurse
Copy-Item (Join-Path $repoRoot "skills") (Join-Path $Staging "skills") -Recurse

# Space files: Dockerfile + .dockerignore as-is; README.space.md -> README.md.
Copy-Item (Join-Path $here "Dockerfile") (Join-Path $Staging "Dockerfile")
Copy-Item (Join-Path $here ".dockerignore") (Join-Path $Staging ".dockerignore")
Copy-Item (Join-Path $here "README.space.md") (Join-Path $Staging "README.md")

Write-Host "Staged HF Space bundle at: $Staging"
Write-Host ""
Write-Host "Validate locally (Docker optional):"
Write-Host "  docker build -t skills-over-mcp-demo `"$Staging`""
Write-Host "  docker run --rm -p 7860:7860 skills-over-mcp-demo"
Write-Host ""
Write-Host "Deploy:"
Write-Host "  hf repos create olaservo/skills-over-mcp-demo --type space --space-sdk docker"
Write-Host "  hf upload olaservo/skills-over-mcp-demo `"$Staging`" . --repo-type space"
