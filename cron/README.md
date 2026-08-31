# Fristenwächter – Einrichtung

[hinweis_cron.py](hinweis_cron.py) läuft täglich über GitHub Actions
([../.github/workflows/hinweis-cron.yml](../.github/workflows/hinweis-cron.yml))
und erledigt sechs Dinge:

| # | Aufgabe | Rechtsgrundlage |
|---|---|---|
| 1 | Vorwarnung 14 Tage vor Ablauf der Rückmeldefrist, Eskalation an den CCO bei Überschreitung | § 17 Abs. 1 Nr. 6 HinSchG |
| 2 | Alarm, wenn nach 7 Tagen keine Eingangsbestätigung vermerkt ist | § 17 Abs. 1 Nr. 1 HinSchG |
| 3 | Erinnerung bei Fällen, die nach 5 Tagen noch keinen Bearbeiter haben | § 17 Abs. 1 Nr. 6 (die Frist läuft ab Eingang) |
| 4 | Fällige Wiedervorlagen der Bearbeiter | – |
| 5 | Löschung 3 Jahre nach Abschluss: Chiffre, Schlüssel, Nachrichten, Anhänge | § 11 Abs. 5 HinSchG |
| 6 | Meldung, wenn ein aktiver Officer kein Schlüsselpaar angelegt hat | – |

## Was der Lauf nicht kann

**Er kann keinen Fall lesen.** Er besitzt keinen privaten Schlüssel und käme
auch mit Vollzugriff auf die Liste an keinen Sachverhalt heran; er rechnet
ausschließlich mit Datumsspalten und Statuswerten aus dem Klartextteil der
Liste.

Das ist der Grund, warum Punkt 5 überhaupt funktionieren kann, ohne den
Vertraulichkeitsgrundsatz zu verletzen: Löschen heißt hier, ein Feld leeren –
dafür muss man seinen Inhalt nicht kennen.

Es ist zugleich der Grund, warum in **keiner** der versendeten Mails ein Thema
oder ein Inhalt steht, sondern nur die Fallnummer. Diese Mails laufen
unverschlüsselt über Exchange und liegen anschließend im Postfach und im
Backup.

## 1. App-Berechtigungen

Der Lauf arbeitet **App-only** (ohne angemeldeten Nutzer). Verwendet wird
dieselbe Registrierung wie beim ZAPP-Cron, **DIHAG Cron-Job**
(`089bf9ad-2d9a-4cbc-b85d-88b4484af0bb`) – oder eine eigene, wenn die
Trennung gewünscht ist.

Im Entra-Portal → App-Registrierung → API-Berechtigungen → **Application
permissions**, danach Admin-Consent:

| Berechtigung | Zweck |
|---|---|
| `Sites.Selected` | Zugriff **nur** auf die Meldestellen-Site, nicht tenant-weit |
| `Mail.Send` | Erinnerungen als `administrator@dihag.com` senden |

> `Sites.Selected` statt `Sites.ReadWrite.All` ist hier nicht Feinschliff,
> sondern notwendig: Ein tenant-weites Schreibrecht auf allen SharePoint-Sites
> in einem Geheimnis, das in GitHub liegt, wäre für ein Hinweisgebersystem
> nicht vertretbar.

`Sites.Selected` allein gewährt noch keinen Zugriff – die App muss zusätzlich
**auf der Site freigeschaltet** werden (einmalig, als Global- oder
SharePoint-Administrator):

```powershell
Connect-MgGraph -TenantId fdb70646-023a-403b-a4b9-1f474a935123 -Scopes "Sites.FullControl.All"
$site = Invoke-MgGraphRequest GET "https://graph.microsoft.com/v1.0/sites/dihag.sharepoint.com:/sites/Meldestelle"
Invoke-MgGraphRequest POST "https://graph.microsoft.com/v1.0/sites/$($site.id)/permissions" -Body (@{
  roles = @("write")
  grantedToIdentities = @(@{ application = @{
      id = "089bf9ad-2d9a-4cbc-b85d-88b4484af0bb"; displayName = "DIHAG Cron-Job" } })
} | ConvertTo-Json -Depth 6) -ContentType "application/json"
```

## 2. Mail.Send einschränken (dringend empfohlen)

`Mail.Send` als Application-Permission gilt sonst für **alle** Postfächer des
Mandanten. Auf den einen Absender begrenzen (Exchange Online PowerShell):

```powershell
New-ApplicationAccessPolicy -AppId 089bf9ad-2d9a-4cbc-b85d-88b4484af0bb `
  -PolicyScopeGroupId hinweis-sender@dihag.com -AccessRight RestrictAccess `
  -Description "Fristenwaechter darf nur als administrator@dihag.com senden"
```

## 3. GitHub-Secrets

Im Repository unter **Settings → Secrets and variables → Actions**:

| Secret | Wert |
|---|---|
| `HINWEIS_TENANT_ID` | `fdb70646-023a-403b-a4b9-1f474a935123` |
| `HINWEIS_CLIENT_ID` | Client-ID der Cron-Registrierung |
| `HINWEIS_CLIENT_SECRET` | Geheimnis dieser Registrierung |

> **Ablaufdatum notieren.** Client-Secrets laufen ab, und wenn dieses abläuft,
> stehen die Fristerinnerungen still – ohne dass es jemandem auffällt, denn
> ein nicht gesendeter Hinweis fehlt nirgends sichtbar. Am besten eine
> Wiedervorlage im Kalender, zwei Wochen vor dem Ablauf.

## 4. Erster Lauf

Zuerst **trocken**: Actions → *Hinweis Fristenwaechter* → **Run workflow** →
Häkchen bei *Trockenlauf*. Der Lauf liest alles, schreibt und sendet aber
nichts und protokolliert, was er täte. So lässt sich prüfen, ob die
Berechtigungen stimmen, bevor die erste Mail an einen Compliance Officer geht.

Lokal geht das genauso:

```bash
HINWEIS_TENANT_ID=… HINWEIS_CLIENT_ID=… HINWEIS_CLIENT_SECRET=… \
HINWEIS_TROCKEN=1 python cron/hinweis_cron.py
```

## 5. Stellschrauben

Über Umgebungsvariablen im Workflow, falls die Vorgaben nicht passen:

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `HINWEIS_VORWARNUNG_TAGE` | 14 | Vorwarnung vor Ablauf der Rückmeldefrist |
| `HINWEIS_UNBEARBEITET_TAGE` | 5 | ab wann ein Fall ohne Bearbeiter gemeldet wird |
| `HINWEIS_BESTAETIGUNG_TAGE` | 7 | gesetzliche Frist für die Eingangsbestätigung |
| `HINWEIS_TROCKEN` | – | `1` = nichts schreiben, nichts senden |

Die Drei-Monats-Frist selbst steht **nicht** hier: Sie wird beim Anlegen des
Falls als Datum in die Spalte `RueckmeldungBis` geschrieben (siehe
`flow/ANLEITUNG-FLOW.md`, Schritt 5.3). Damit gilt für jeden Fall die Frist,
die bei seinem Eingang galt – eine spätere Änderung der Konfiguration
verschiebt keine laufende Frist rückwirkend.
