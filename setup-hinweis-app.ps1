# ══════════════════════════════════════════════════════════════════════
#  DIHAG Hinweisgebersystem - Entra-App fuer die FALLBEARBEITUNG
#
#    1. App-Registrierung anlegen oder wiederverwenden
#    2. Redirect-URIs als Single-Page-Anwendung eintragen
#    3. Delegierte Graph-Berechtigungen hinterlegen und den
#       Zustimmungs-Link ausgeben
#    4. Die ClientId in js/config.js eintragen
#
#  Betrifft NUR bearbeitung.html. Die Meldeseite und das anonyme Postfach
#  kommen ohne Anmeldung aus und damit ohne diese Registrierung - das ist
#  der Kern der Anonymitaet und kein Versehen.
#
#  Aufruf (Konto mit Anwendungsadministrator-Rechten):
#      Install-Module Microsoft.Graph -Scope CurrentUser
#      Connect-MgGraph -Scopes "Application.ReadWrite.All"
#      ./setup-hinweis-app.ps1
#
#  Nur nachsehen, nichts aendern:
#      ./setup-hinweis-app.ps1 -WhatIfOnly
# ══════════════════════════════════════════════════════════════════════

param(
    [string]   $AppName   = "DIHAG Hinweisgebersystem",
    # Leer lassen, um die Registrierung anzulegen bzw. ueber den Namen zu
    # finden. Ist sie schon da, hier die ClientId eintragen.
    [string]   $ClientId  = "",
    [string]   $TenantId  = "fdb70646-023a-403b-a4b9-1f474a935123",

    # Die Anmeldung laeuft ausschliesslich auf bearbeitung.html - js/graph.js
    # nimmt die aufgerufene Seite als Rueckkehradresse. Die Startseite steht
    # bewusst NICHT dabei: Dort darf nie ein Anmeldefenster erscheinen.
    [string[]] $RedirectUris = @(
        "https://hinweis.dihag.de/bearbeitung.html",
        "https://dfedorov12.github.io/hinweis/bearbeitung.html"
    ),

    [string[]] $Scopes = @("User.Read", "Sites.ReadWrite.All", "Mail.Send"),

    [string]   $ConfigPfad = "js/config.js",
    [switch]   $WhatIfOnly
)

$ErrorActionPreference = "Stop"
$g = "https://graph.microsoft.com/v1.0"
$GRAPH_APP = "00000003-0000-0000-c000-000000000000"

function Gx {
    param([string]$Method = "GET", [string]$Uri, $Body)
    if ($null -ne $Body) {
        return Invoke-MgGraphRequest -Method $Method -Uri $Uri `
            -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
    }
    return Invoke-MgGraphRequest -Method $Method -Uri $Uri
}

Write-Host "=== DIHAG Hinweisgebersystem - App-Registrierung ===" -ForegroundColor Cyan
if ($WhatIfOnly) { Write-Host "Nur Anzeige - es wird nichts geaendert." -ForegroundColor Yellow }

try { $null = Get-MgContext } catch {
    throw "Nicht angemeldet. Zuerst: Connect-MgGraph -Scopes 'Application.ReadWrite.All'"
}

# ── 1 · Registrierung finden oder anlegen ─────────────────────────────
$app = $null
if ($ClientId) {
    $app = (Gx -Uri "$g/applications?`$filter=appId eq '$ClientId'").value | Select-Object -First 1
    if (-not $app) { throw "App-Registrierung $ClientId nicht gefunden (falscher Mandant?)." }
} else {
    $name = $AppName.Replace("'", "''")
    $app = (Gx -Uri "$g/applications?`$filter=displayName eq '$name'").value | Select-Object -First 1
}

if (-not $app) {
    if ($WhatIfOnly) {
        Write-Host "`n[1] WUERDE die Registrierung '$AppName' anlegen." -ForegroundColor Yellow
        return
    }
    $app = Gx -Method POST -Uri "$g/applications" -Body @{
        displayName    = $AppName
        signInAudience = "AzureADMyOrg"
        spa            = @{ redirectUris = $RedirectUris }
    }
    Write-Host "`n[1] Registrierung '$AppName' angelegt." -ForegroundColor Green
    # Der Verzeichnisdienst braucht einen Moment, bis die neue Registrierung
    # ueberall bekannt ist. Ohne diese Pause scheitert das folgende PATCH
    # gelegentlich mit "Resource not found".
    Start-Sleep -Seconds 5
} else {
    Write-Host "`n[1] Registrierung gefunden: $($app.displayName)  ($($app.appId))" -ForegroundColor Yellow
}
$ClientId = $app.appId

# ── 2 · Redirect-URIs ─────────────────────────────────────────────────
Write-Host "`n[2] Redirect-URIs (Single-Page-Anwendung)" -ForegroundColor Yellow
$vorhanden = @()
if ($app.spa -and $app.spa.redirectUris) { $vorhanden = @($app.spa.redirectUris) }
$fehlend = $RedirectUris | Where-Object { $vorhanden -notcontains $_ }

if (-not $fehlend) {
    Write-Host "  Bereits vollstaendig:" -ForegroundColor Green
    $vorhanden | ForEach-Object { Write-Host "    $_" }
} elseif ($WhatIfOnly) {
    Write-Host "  WUERDE ergaenzen:" -ForegroundColor Yellow
    $fehlend | ForEach-Object { Write-Host "    + $_" }
} else {
    $neu = @($vorhanden + $fehlend | Select-Object -Unique)
    Gx -Method PATCH -Uri "$g/applications/$($app.id)" -Body @{ spa = @{ redirectUris = $neu } } | Out-Null
    Write-Host "  Ergaenzt:" -ForegroundColor Green
    $fehlend | ForEach-Object { Write-Host "    + $_" }
    Write-Host "  Die Adressen muessen unter 'Single-Page-Anwendung' stehen," -ForegroundColor DarkGray
    Write-Host "  nicht unter 'Web' - sonst schlaegt PKCE fehl." -ForegroundColor DarkGray
}

# ── 3 · Delegierte Graph-Berechtigungen ───────────────────────────────
Write-Host "`n[3] Delegierte Berechtigungen: $($Scopes -join ', ')" -ForegroundColor Yellow
Write-Host "  Hinweis: Es werden ausschliesslich DELEGIERTE Rechte vergeben." -ForegroundColor DarkGray
Write-Host "  Die Anwendung handelt immer im Namen des angemeldeten Compliance" -ForegroundColor DarkGray
Write-Host "  Officers, nie mit eigenen Anwendungsrechten. Ein Anwendungsrecht" -ForegroundColor DarkGray
Write-Host "  waere ein Generalschluessel auf alle SharePoint-Inhalte." -ForegroundColor DarkGray

$sp = (Gx -Uri "$g/servicePrincipals?`$filter=appId eq '$GRAPH_APP'&`$select=id,appId,oauth2PermissionScopes").value[0]
$ids = @()
foreach ($s in $Scopes) {
    $scope = $sp.oauth2PermissionScopes | Where-Object { $_.value -eq $s }
    if (-not $scope) { Write-Warning "  Scope '$s' nicht gefunden - uebersprungen."; continue }
    $ids += [pscustomobject]@{ id = $scope.id; type = "Scope"; value = $s }
}

$rra      = @($app.requiredResourceAccess)
$graphRra = $rra | Where-Object { $_.resourceAppId -eq $GRAPH_APP }
$schon    = @()
if ($graphRra) { $schon = @($graphRra.resourceAccess | ForEach-Object { $_.id }) }
$neuIds   = $ids | Where-Object { $schon -notcontains $_.id }

if (-not $neuIds) {
    Write-Host "  Alle Berechtigungen sind bereits eingetragen." -ForegroundColor Green
} elseif ($WhatIfOnly) {
    Write-Host "  WUERDE ergaenzen: $(($neuIds.value) -join ', ')" -ForegroundColor Yellow
} else {
    $zugriff = @()
    foreach ($id in ($schon + ($neuIds | ForEach-Object { $_.id }) | Select-Object -Unique)) {
        $zugriff += @{ id = $id; type = "Scope" }
    }
    $andere = $rra | Where-Object { $_.resourceAppId -ne $GRAPH_APP }
    $body = @{ requiredResourceAccess = @($andere) + @(@{ resourceAppId = $GRAPH_APP; resourceAccess = $zugriff }) }
    Gx -Method PATCH -Uri "$g/applications/$($app.id)" -Body $body | Out-Null
    Write-Host "  Ergaenzt: $(($neuIds.value) -join ', ')" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Zustimmung fuer den Mandanten (einmalig, als Administrator oeffnen):" -ForegroundColor Cyan
Write-Host "  https://login.microsoftonline.com/$TenantId/adminconsent?client_id=$ClientId"
Write-Host "  Ohne Zustimmung sehen normale Nutzer beim Anmelden AADSTS65001." -ForegroundColor DarkGray

# ── 4 · ClientId in js/config.js eintragen ────────────────────────────
Write-Host "`n[4] $ConfigPfad" -ForegroundColor Yellow
if (Test-Path $ConfigPfad) {
    $inhalt = Get-Content $ConfigPfad -Raw -Encoding UTF8
    if ($inhalt -match 'clientId:\s*"' + [regex]::Escape($ClientId) + '"') {
        Write-Host "  ClientId steht bereits richtig darin." -ForegroundColor Green
    } elseif ($WhatIfOnly) {
        Write-Host "  WUERDE clientId auf $ClientId setzen." -ForegroundColor Yellow
    } else {
        $neu = [regex]::Replace($inhalt, 'clientId:\s*"[^"]*"', "clientId: `"$ClientId`"", 1)
        # Ohne BOM schreiben - GitHub Pages liefert die Datei sonst mit einem
        # unsichtbaren Zeichen am Anfang aus, ueber das manche Browser beim
        # Parsen stolpern.
        [System.IO.File]::WriteAllText(
            (Resolve-Path $ConfigPfad),
            $neu,
            (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "  clientId auf $ClientId gesetzt." -ForegroundColor Green
    }
} else {
    Write-Warning "  $ConfigPfad nicht gefunden. Bitte von Hand eintragen:"
    Write-Warning "    clientId: `"$ClientId`""
}

Write-Host @"

Fertig. Weiter mit:
  1. provision-hinweis-listen.ps1  (Listen der Meldestelle)
  2. flow/ANLEITUNG-FLOW.md        (Annahmestelle), URL in js/config.js
  3. bearbeitung.html oeffnen, als Chief Compliance Officer anmelden
     und das Schluesselpaar anlegen. ERST DANACH nimmt das Meldeformular
     Meldungen an - ohne oeffentlichen Schluessel gibt es nichts zu
     verschluesseln, und Klartext nimmt diese Anwendung nicht entgegen.
  4. cron/README.md                (taegliche Fristenueberwachung)

"@ -ForegroundColor Cyan
