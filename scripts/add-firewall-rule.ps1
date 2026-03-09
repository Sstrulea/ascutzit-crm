# Regulă Windows Firewall pentru portul 3000 (CRM Next.js – acces din rețea)
# Trebuie rulat o singură dată, cu drepturi de Administrator.

$RuleName = "CRM Next.js - port 3000"
$Port = 3000

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Regula exista deja: $RuleName" -ForegroundColor Yellow
    Write-Host "Daca tot nu merge, sterge-o si ruleaza din nou: Remove-NetFirewallRule -DisplayName '$RuleName'"
    exit 0
}

try {
    New-NetFirewallRule -DisplayName $RuleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow `
        -Profile Private `
        -ErrorAction Stop
    Write-Host ""
    Write-Host "OK: Regula de firewall a fost adaugata." -ForegroundColor Green
    Write-Host "    Portul $Port (TCP) este permis pe retea Privata (Wi-Fi / acasa)." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Acum ruleaza:  npm run dev:lan" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "Eroare (rulezi ca Administrator?): $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fa manual:" -ForegroundColor Yellow
    Write-Host "  1. Cauta 'Firewall Windows Defender' -> Setari avansate"
    Write-Host "  2. Reguli de tip Inbound -> Regula noua -> Port"
    Write-Host "  3. TCP, port 3000 -> Permite -> Profil: Privat"
    Write-Host ""
    exit 1
}
