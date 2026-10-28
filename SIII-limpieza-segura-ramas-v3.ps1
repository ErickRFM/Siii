param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$repo = 'ErickRFM/Siii'
$protected = @('main','master','develop','feat/sis-foundation')
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git no está instalado.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) no está instalado.' }
$origin = (git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch 'ErickRFM/Siii(\.git)?$') { throw "Debes ejecutar esto en el repositorio ErickRFM/Siii. Origin: $origin" }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'Ejecuta gh auth login primero.' }
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'Falló git fetch.' }
$open = @(gh pr list --repo $repo --state open --limit 500 --json headRefName --jq '.[].headRefName')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron comprobar los PR abiertos; cancelando.' }
$remoteBranches = @(git for-each-ref --format='%(refname:short)' refs/remotes/origin | Where-Object { $_ -ne 'origin' -and $_ -ne 'origin/HEAD' -and $_ -ne 'origin/main' -and $_ -like 'origin/*' })
$safe = @(); $kept = @()
foreach ($remote in $remoteBranches) {
  $branch = $remote -replace '^origin/',''
  if ($protected -contains $branch -or $open -contains $branch) { $kept += $branch; continue }
  git merge-base --is-ancestor "refs/remotes/$remote" refs/remotes/origin/main
  if ($LASTEXITCODE -eq 0) { $safe += $branch } elseif ($LASTEXITCODE -eq 1) { $kept += $branch } else { throw "No se pudo comparar $branch" }
}
Write-Host "Ramas eliminables (fusionadas por ancestry): $($safe.Count)" -ForegroundColor Cyan
$safe | Sort-Object | ForEach-Object { Write-Host "  $_" }
Write-Host "Conservadas: $($kept.Count)" -ForegroundColor Yellow
if (-not $Apply) {
  Write-Host 'SIMULACIÓN: No se eliminó ninguna rama. Vuelve a ejecutar con -Apply para eliminar solo las mostradas.' -ForegroundColor Yellow
  exit 0
}
foreach ($branch in $safe) {
  # Revalidación local antes de cada eliminación. Nunca aplicar force.
  git merge-base --is-ancestor "refs/remotes/origin/$branch" refs/remotes/origin/main
  if ($LASTEXITCODE -ne 0) { throw "La rama ya no parece fusionada: $branch" }
  git push origin --delete $branch
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo borrar $branch" }
}
git fetch origin --prune
Write-Host 'Limpieza concluida. Las ramas no fusionadas y los PR abiertos permanecen intactos.' -ForegroundColor Green
