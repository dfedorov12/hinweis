<#
    DIHAG Hinweisgebersystem - SharePoint-Listen anlegen
    ====================================================

    Legt die fuenf Listen und die Anlagenbibliothek der Meldestelle an.
    Idempotent: Vorhandenes wird uebersprungen, nichts geloescht.

    WICHTIG - eigene Site, nicht /sites/IT
    --------------------------------------
    Die Listen gehoeren auf eine eigene SharePoint-Site, deren Mitglieder
    ausschliesslich die Compliance Officer sind. Zwar sind die Fallinhalte
    verschluesselt und ein Fremder saehe nur Base64 - aber schon die reine
    Existenz eines Falls zu einer bestimmten Gesellschaft ist eine Information,
    die niemanden ausserhalb der Meldestelle etwas angeht.

    Voraussetzungen
    ---------------
      Install-Module PnP.PowerShell -Scope CurrentUser
      Eine registrierte Entra-App fuer PnP (ClientId), siehe
      https://pnp.github.io/powershell/articles/registerapplication.html

    Aufruf
    ------
      .\provision-hinweis-listen.ps1 `
          -SiteUrl "https://dihag.sharepoint.com/sites/Meldestelle" `
          -ClientId "<pnp-app-guid>" `
          -ChiefComplianceOfficer "cco@dihag.com"
#>

param(
    [Parameter(Mandatory)] [string]$SiteUrl,
    [Parameter(Mandatory)] [string]$ClientId,
    [Parameter(Mandatory)] [string]$ChiefComplianceOfficer
)

$ErrorActionPreference = "Stop"

Write-Host "Verbinde mit $SiteUrl ..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

function Ensure-Liste {
    param([string]$Titel, [string]$Beschreibung)
    $l = Get-PnPList -Identity $Titel -ErrorAction SilentlyContinue
    if (-not $l) {
        # Versionierung an: Die Dokumentationspflicht nach Paragraph 11 HinSchG
        # verlangt Nachvollziehbarkeit. Wer eine Statuszeile aendert, soll das
        # nicht spurlos tun koennen.
        $l = New-PnPList -Title $Titel -Template GenericList -EnableVersioning
        Write-Host "  Liste '$Titel' angelegt." -ForegroundColor Green
    } else {
        Write-Host "  Liste '$Titel' vorhanden."
    }
    if ($Beschreibung) {
        Set-PnPList -Identity $Titel -Description $Beschreibung | Out-Null
    }
    return $l
}

function Ensure-Feld {
    param([string]$Liste, [hashtable]$F)
    if (Get-PnPField -List $Liste -Identity $F.N -ErrorAction SilentlyContinue) { return }
    $p = @{
        List             = $Liste
        InternalName     = $F.N
        DisplayName      = $F.D
        Type             = $F.T
        AddToDefaultView = [bool]$F.V
    }
    if ($F.C) { $p.Choices = $F.C }
    Add-PnPField @p | Out-Null
    Write-Host "    Feld $($F.N) ($($F.T))" -ForegroundColor DarkGray
}

# ===========================================================================
# 1. Hinweis_Faelle
# ===========================================================================
Write-Host "`n[1/6] Hinweis_Faelle" -ForegroundColor Cyan
Ensure-Liste "Hinweis_Faelle" ("Faelle der internen Meldestelle. Die Spalten " +
    "Chiffre und SchluesselJson sind Ende-zu-Ende-verschluesselt und fuer " +
    "Administratoren bewusst nicht lesbar.") | Out-Null

# Zur Spalte 'Chiffre': Ein Mehrzeilenfeld fasst 63.999 Zeichen. Die
# Feldlaengen im Meldeformular sind so bemessen, dass die Chiffre darunter
# bleibt (rund 19.000 Zeichen Eingabe -> rund 30.000 Zeichen Base64).
# Wer die Formularfelder vergroessert, muss das hier nachrechnen - eine
# abgeschnittene Chiffre ist nicht mehr zu entschluesseln.

$felderFaelle = @(
    @{N="Eingang";                D="Eingegangen am";              T="DateTime"; V=$true},
    @{N="Art";                    D="Art";                         T="Choice";   V=$true;
      C=@("Hinweis","Anfrage")},
    @{N="Thema";                  D="Thema";                       T="Text";     V=$true},
    @{N="Gesellschaft";           D="Betroffene Gesellschaft";     T="Text";     V=$true},
    @{N="Bereich";                D="Betroffener Bereich";         T="Text";     V=$false},
    @{N="Bedeutung";              D="Bedeutung";                   T="Text";     V=$false},
    @{N="Status";                 D="Status";                      T="Choice";   V=$true;
      C=@("Neu","In Bearbeitung","Rueckfrage","Abgeschlossen","Abgewiesen")},
    @{N="Bearbeiter";             D="Fallbearbeiter";              T="Text";     V=$true},

    # --- Verschluesselung -------------------------------------------------
    @{N="CodeKennung";            D="Code-Kennung";                T="Text";     V=$false},
    @{N="Chiffre";                D="Inhalt (verschluesselt)";     T="Note";     V=$false},
    @{N="SchluesselJson";         D="Schluesseltabelle";           T="Note";     V=$false},

    # --- Wuensche des Hinweisgebers ---------------------------------------
    @{N="Rueckfragen";            D="Rueckfragen zugelassen";      T="Boolean";  V=$false},
    @{N="Treffen";                D="Treffen gewuenscht";          T="Boolean";  V=$false},

    # --- Fristen nach HinSchG ---------------------------------------------
    @{N="EingangsbestaetigungAm"; D="Eingangsbestaetigung am";     T="DateTime"; V=$false},
    @{N="RueckmeldungBis";        D="Rueckmeldung faellig bis";    T="DateTime"; V=$true},
    @{N="RueckmeldungAm";         D="Rueckmeldung erfolgt am";     T="DateTime"; V=$false},
    @{N="AbschlussAm";            D="Abgeschlossen am";            T="DateTime"; V=$false},
    @{N="Ergebnis";               D="Ergebnis";                    T="Text";     V=$false},
    @{N="Massnahme";              D="Folgemassnahme";              T="Text";     V=$false},
    @{N="LoeschenAm";             D="Zu loeschen am";              T="DateTime"; V=$false},

    # --- Betrieb ----------------------------------------------------------
    @{N="WiedervorlageAm";        D="Wiedervorlage am";            T="DateTime"; V=$false},
    @{N="WiedervorlageGrund";     D="Wiedervorlage Notiz";         T="Text";     V=$false},
    @{N="AnzahlAnhaenge";         D="Anzahl Anhaenge";             T="Number";   V=$false},
    @{N="Geloescht";              D="Inhalt geloescht";            T="Boolean";  V=$false},
    @{N="ErinnerungGesendet";     D="Erinnerung gesendet";         T="Boolean";  V=$false},
    @{N="EskalationGesendet";     D="Eskalation gesendet";         T="Boolean";  V=$false},
    @{N="WvGesendet";             D="Wiedervorlage gesendet";      T="Boolean";  V=$false}
)
foreach ($f in $felderFaelle) { Ensure-Feld "Hinweis_Faelle" $f }

# Der Flow und das Postfach suchen ueber diese beiden Spalten. Ohne Index
# wird jede Postfachanmeldung zu einem vollstaendigen Listendurchlauf und
# laeuft ab 5.000 Eintraegen in die Drosselung von SharePoint.
foreach ($idx in @("CodeKennung", "Status")) {
    try {
        Add-PnPFieldToContentType -Field $idx -ContentType "Item" -ErrorAction SilentlyContinue | Out-Null
        Set-PnPField -List "Hinweis_Faelle" -Identity $idx -Values @{Indexed=$true} | Out-Null
        Write-Host "    Index auf $idx gesetzt." -ForegroundColor DarkGray
    } catch {
        Write-Warning "    Index auf $idx nicht gesetzt: $($_.Exception.Message)"
    }
}

# ===========================================================================
# 2. Hinweis_Nachrichten
# ===========================================================================
Write-Host "`n[2/6] Hinweis_Nachrichten" -ForegroundColor Cyan
Ensure-Liste "Hinweis_Nachrichten" "Anonymer Dialog. Inhalte verschluesselt." | Out-Null
foreach ($f in @(
    @{N="Fallnummer"; D="Fallnummer";              T="Text";     V=$true},
    @{N="Richtung";   D="Richtung";                T="Choice";   V=$true;
      C=@("Hinweisgeber","Meldestelle")},
    @{N="Chiffre";    D="Nachricht (verschluesselt)"; T="Note";  V=$false},
    @{N="Gesendet";   D="Gesendet am";             T="DateTime"; V=$true},
    @{N="GelesenAm";  D="Gelesen am";              T="DateTime"; V=$false}
)) { Ensure-Feld "Hinweis_Nachrichten" $f }
try {
    Set-PnPField -List "Hinweis_Nachrichten" -Identity "Fallnummer" -Values @{Indexed=$true} | Out-Null
} catch { Write-Warning "    Index auf Fallnummer nicht gesetzt." }

# ===========================================================================
# 3. Hinweis_Dokumentation
# ===========================================================================
Write-Host "`n[3/6] Hinweis_Dokumentation" -ForegroundColor Cyan
Ensure-Liste "Hinweis_Dokumentation" ("Dokumentationspflicht nach Paragraph 11 " +
    "HinSchG. Eintraege werden nicht geaendert und nicht geloescht.") | Out-Null
foreach ($f in @(
    @{N="Fallnummer";   D="Fallnummer";   T="Text";     V=$true},
    @{N="Aktion";       D="Aktion";       T="Text";     V=$true},
    @{N="Einzelheiten"; D="Einzelheiten"; T="Note";     V=$false},
    @{N="Akteur";       D="Bearbeiter";   T="Text";     V=$true},
    @{N="Zeitpunkt";    D="Zeitpunkt";    T="DateTime"; V=$true}
)) { Ensure-Feld "Hinweis_Dokumentation" $f }

# ===========================================================================
# 4. Hinweis_Bearbeiter
# ===========================================================================
Write-Host "`n[4/6] Hinweis_Bearbeiter" -ForegroundColor Cyan
Ensure-Liste "Hinweis_Bearbeiter" ("Compliance Officer samt oeffentlichem " +
    "Schluessel. Der private Schluessel liegt hier nur verschluesselt.") | Out-Null
foreach ($f in @(
    @{N="Anzeigename";    D="Name";                          T="Text";     V=$true},
    @{N="Rolle";          D="Rolle";                         T="Choice";   V=$true;
      C=@("Chief Compliance Officer","Compliance Officer")},
    @{N="Gesellschaften"; D="Zustaendig fuer";               T="Text";     V=$true},
    @{N="PubKey";         D="Oeffentlicher Schluessel";      T="Note";     V=$false},
    @{N="PrivKeyEnc";     D="Privater Schluessel (Passphrase)"; T="Note";  V=$false},
    @{N="PrivKeyNot";     D="Privater Schluessel (Notfall)"; T="Note";     V=$false},
    @{N="KdfSalt";        D="Salz";                          T="Text";     V=$false},
    @{N="SchluesselAm";   D="Schluessel angelegt am";        T="DateTime"; V=$false},
    @{N="Aktiv";          D="Aktiv";                         T="Boolean";  V=$true}
)) { Ensure-Feld "Hinweis_Bearbeiter" $f }

if (-not (Get-PnPListItem -List "Hinweis_Bearbeiter" -PageSize 1)) {
    Add-PnPListItem -List "Hinweis_Bearbeiter" -Values @{
        Title          = $ChiefComplianceOfficer
        Anzeigename    = "Chief Compliance Officer"
        Rolle          = "Chief Compliance Officer"
        Gesellschaften = "*"
        Aktiv          = $true
    } | Out-Null
    Write-Host "  Chief Compliance Officer '$ChiefComplianceOfficer' eingetragen." -ForegroundColor Green
    Write-Host "  -> Diese Person muss sich nun in bearbeitung.html anmelden und" -ForegroundColor Yellow
    Write-Host "     ihr Schluesselpaar anlegen. Vorher kann NIEMAND melden:" -ForegroundColor Yellow
    Write-Host "     Ohne oeffentlichen Schluessel verweigert das Formular den Dienst." -ForegroundColor Yellow
}

# ===========================================================================
# 5. Hinweis_Konfiguration
# ===========================================================================
Write-Host "`n[5/6] Hinweis_Konfiguration" -ForegroundColor Cyan
Ensure-Liste "Hinweis_Konfiguration" "Auswahllisten fuer Gesellschaften und Themen." | Out-Null
foreach ($f in @(
    @{N="Art";        D="Art";        T="Choice"; V=$true; C=@("Gesellschaft","Thema")},
    @{N="Reihenfolge"; D="Reihenfolge"; T="Number"; V=$true}
)) { Ensure-Feld "Hinweis_Konfiguration" $f }

if (-not (Get-PnPListItem -List "Hinweis_Konfiguration" -PageSize 1)) {
    $gesellschaften = @(
        "DIHAG Holding GmbH",
        "MEUSELWITZ GUSS Eisengiesserei GmbH",
        "SHB Stahl- und Hartgusswerk Boesdorf GmbH",
        "EWA Eisenwerk Arnstadt GmbH",
        "DIHAG Zaigler GmbH",
        "DIHAG Eisenberg GmbH",
        "Weiss ich nicht / gesellschaftsuebergreifend"
    )
    # Reihenfolge wie in der Dokumentation der Altloesung. "Sonstiges" steht
    # bewusst am Ende, damit es nicht zur bequemen Standardantwort wird.
    $themen = @(
        "Arbeitssicherheit", "Betrug, Unterschlagung", "Datenschutz",
        "Exportkontrolle, Embargo und Sanktionen", "Fuehrungsverhalten",
        "Geldwaesche und Terrorismusfinanzierung", "Geschaeftsgeheimnisse",
        "Geschenke und Einladungen", "Gesundheitsschutz", "Informationssicherheit",
        "Interessenkonflikte", "Kartellrecht, Wettbewerbsrecht", "Korruption",
        "Kundenrechte, Verbraucherschutz", "Mitarbeiterverhalten",
        "Diskriminierung, Mobbing", "Produktsicherheit", "Qualitaetsmanagement",
        "Strafbares Verhalten von Beschaeftigten",
        "Strafbares Verhalten von Lieferanten", "Umweltschutz",
        "Verstoesse in der Lieferkette", "Sonstiges"
    )
    $i = 0
    foreach ($g in $gesellschaften) {
        Add-PnPListItem -List "Hinweis_Konfiguration" `
            -Values @{Title=$g; Art="Gesellschaft"; Reihenfolge=($i++)} | Out-Null
    }
    $i = 0
    foreach ($t in $themen) {
        Add-PnPListItem -List "Hinweis_Konfiguration" `
            -Values @{Title=$t; Art="Thema"; Reihenfolge=($i++)} | Out-Null
    }
    Write-Host "  $($gesellschaften.Count) Gesellschaften und $($themen.Count) Themen eingetragen." -ForegroundColor Green
    Write-Host "  ACHTUNG: Umlaute wurden hier ASCII geschrieben, weil PowerShell-" -ForegroundColor Yellow
    Write-Host "  Skripte je nach Codepage sonst Zeichensalat erzeugen. Bitte die" -ForegroundColor Yellow
    Write-Host "  Eintraege in SharePoint einmal auf korrekte Schreibweise pruefen." -ForegroundColor Yellow
}

# ===========================================================================
# 6. Hinweis_Anlagen (Dokumentbibliothek)
# ===========================================================================
Write-Host "`n[6/6] Hinweis_Anlagen" -ForegroundColor Cyan
if (-not (Get-PnPList -Identity "Hinweis_Anlagen" -ErrorAction SilentlyContinue)) {
    New-PnPList -Title "Hinweis_Anlagen" -Template DocumentLibrary | Out-Null
    Write-Host "  Bibliothek 'Hinweis_Anlagen' angelegt." -ForegroundColor Green
} else {
    Write-Host "  Bibliothek 'Hinweis_Anlagen' vorhanden."
}

Write-Host @"

Fertig.

Naechste Schritte
-----------------
  1. Berechtigungen der Site pruefen: Nur die Compliance Officer und das
     Verbindungskonto des Flows duerfen Mitglied sein. Vererbung von der
     uebergeordneten Site brechen, falls vorhanden.
  2. setup-hinweis-app.ps1 ausfuehren (Entra-App fuer die Bearbeitungsseite).
  3. Power-Automate-Flow anlegen, siehe flow/ANLEITUNG-FLOW.md,
     und die HTTP-POST-Adresse in js/config.js unter 'endpunkt' eintragen.
  4. Als Chief Compliance Officer in bearbeitung.html anmelden und das
     Schluesselpaar anlegen. Erst danach nimmt das Meldeformular Meldungen an.
  5. GitHub-Actions-Secrets fuer den taeglichen Cron-Lauf setzen
     (siehe cron/README.md).

"@ -ForegroundColor Cyan
