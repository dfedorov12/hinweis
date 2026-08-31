# DIHAG Hinweisgebersystem

Anonymes Meldesystem der DIHAG Foundry Group nach dem Hinweisgeberschutzgesetz
(HinSchG) und § 8 LkSG. Ersetzt die bisherige Fremdlösung *equeo CompCor*.

**Live:** <https://hinweis.dihag.de/> ·
Fallbearbeitung: <https://hinweis.dihag.de/bearbeitung.html>

---

## Was diese Anwendung anders macht

Sie kennt **keine Identität**. Es gibt kein Namensfeld, kein E-Mail-Feld, keine
Anmeldung und kein Cookie. Und sie kann die Meldungen selbst nicht lesen: Der
Inhalt wird im Browser des Hinweisgebers verschlüsselt und nur für die
zuständigen Compliance Officer verpackt.

Daraus folgt der Satz, an dem sich alles entscheidet:

> Ein Administrator mit Vollzugriff auf SharePoint sieht, **dass** es einen
> Fall gibt. Er sieht kein Wort seines Inhalts – und kann daran nichts ändern.

Genau das verlangt § 8 HinSchG (Vertraulichkeitsgebot), und genau das leistet
eine gewöhnliche SharePoint-Liste nicht.

```
Hinweisgeber (kein Login)          Meldestelle (Entra-Login)
─────────────────────────          ─────────────────────────────
index.html                         bearbeitung.html
  Formular ausfüllen                 Fallübersicht, Fristen, Statistik
  │  verschlüsselt im Browser        Detailansicht, Dialog, Abschluss
  │                                  │  entschlüsselt im Browser
  ▼                                  ▲
Power-Automate-Flow ────────► SharePoint (nur Chiffre) ◄─── Microsoft Graph
  (Briefkasten, kein Mitleser)   Hinweis_Faelle                (delegiert)
  │                              Hinweis_Nachrichten
  ▼                              Hinweis_Dokumentation      GitHub Actions
postfach.html                    Hinweis_Bearbeiter    ◄─── Fristenwächter
  Fallnummer + Zugangscode       Hinweis_Konfiguration       (täglich, App-only,
  Stand, Dialog, Rückmeldung     Hinweis_Anlagen              kann nichts lesen)
```

## Die beiden Wege zum Inhalt

Für jeden Fall wird ein zufälliger AES-256-Schlüssel erzeugt. Er verschlüsselt
Sachverhalt, Nachrichten und Anhänge – und wird selbst zweifach verpackt:

| Weg | Verpackt mit | Wer ihn geht |
|---|---|---|
| Zugangscode | PBKDF2 aus dem 80-Bit-Code des Hinweisgebers | der Hinweisgeber im Postfach |
| Officer-Schlüssel | RSA-OAEP mit dem öffentlichen Schlüssel jedes zuständigen Officers | die Meldestelle |

Einen dritten Weg gibt es nicht. Kein Generalschlüssel, kein Zurücksetzen,
keine Hintertür – das wäre die Lücke, die § 8 gerade verbietet.

Einzelheiten und die Begründung der Parameter stehen im Kopf von
[`js/krypto.js`](js/krypto.js).

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html` · `js/meldung.js` | Meldeformular, öffentlich, ohne Anmeldung |
| `postfach.html` · `js/postfach.js` | anonymes Postfach (Fallnummer + Zugangscode) |
| `bearbeitung.html` · `js/bearbeitung.js` | Fallbearbeitung, Anmeldung über Entra |
| `datenschutz.html` | Informationen nach Art. 13 DSGVO |
| `js/krypto.js` | die gesamte Verschlüsselung – **hier zuerst lesen** |
| `js/api.js` | einziger Weg der öffentlichen Seiten nach draußen |
| `js/graph.js` · `js/schluessel.js` | Anmeldung, SharePoint, Schlüssel- und Rechteverwaltung |
| `js/export.js` | Fallakte als Word/PDF, Statistik als CSV |
| `js/i18n.js` | Deutsch/Englisch für die öffentlichen Seiten |
| `flow/ANLEITUNG-FLOW.md` | Power-Automate-Flow Schritt für Schritt |
| `cron/hinweis_cron.py` | täglicher Fristenwächter (GitHub Actions) |
| `provision-hinweis-listen.ps1` | SharePoint-Listen anlegen |
| `setup-hinweis-app.ps1` | Entra-Registrierung für die Bearbeitungsseite |
| `RECHTSKONFORMITAET.md` | Zuordnung Norm → Umsetzung, **und die offenen Punkte** |
| `tests/` | Prüfungen (siehe unten) |

## Inbetriebnahme

Die Reihenfolge ist nicht beliebig – Schritt 5 setzt alle vorherigen voraus.

```powershell
# 1. SharePoint-Site "Meldestelle" anlegen, Mitglieder: nur Compliance Officer.
#    Vererbung der Berechtigungen brechen.

# 2. Listen anlegen
Install-Module PnP.PowerShell -Scope CurrentUser
./provision-hinweis-listen.ps1 `
    -SiteUrl "https://dihag.sharepoint.com/sites/Meldestelle" `
    -ClientId "<pnp-app-guid>" `
    -ChiefComplianceOfficer "cco@dihag.com"

# 3. Entra-Registrierung für die Bearbeitungsseite
Connect-MgGraph -Scopes "Application.ReadWrite.All"
./setup-hinweis-app.ps1        # trägt die clientId in js/config.js ein
```

4. **Power-Automate-Flow** nach [`flow/ANLEITUNG-FLOW.md`](flow/ANLEITUNG-FLOW.md)
   bauen und die HTTP-POST-Adresse in `js/config.js` unter `endpunkt` eintragen.

5. **Schlüsselpaar anlegen**: als Chief Compliance Officer `bearbeitung.html`
   öffnen → *Mein Schlüssel* → Passphrase setzen → **Notfallschlüssel drucken
   und in den Tresor legen.**

   > Bis hierher nimmt das Meldeformular **keine** Meldungen an. Ohne
   > öffentlichen Schlüssel gäbe es nichts, wofür verschlüsselt werden könnte –
   > und Klartext nimmt diese Anwendung nicht entgegen. Das ist kein Fehler,
   > sondern die Voreinstellung.

6. **Fristenwächter** einrichten: [`cron/README.md`](cron/README.md).
   Ersten Lauf als Trockenlauf starten.

7. **Probelauf mit einem echten Durchgang**: Meldung absenden, Zettel notieren,
   Postfach damit öffnen, als Officer bearbeiten, abschließen, Rückmeldung im
   Postfach nachlesen. Testfall danach in SharePoint löschen.

8. Offene organisatorische Punkte abarbeiten:
   [`RECHTSKONFORMITAET.md`](RECHTSKONFORMITAET.md) Abschnitt 4
   (DSFA, Art.-30-Verzeichnis, Betriebsrat, Bekanntmachung).

## Prüfen

```bash
node tests/test-krypto.mjs
```

50 Prüfungen der Verschlüsselung: Zufall und Gleichverteilung der Codes, beide
Wege zum Inhalt, Abweisung falscher Codes und fremder Schlüssel, Erkennung
manipulierter Chiffren, nachträgliche Freigabe, Binäranhänge.

Warum so gründlich: Ein Fehler in der Krypto meldet sich nicht. Ein falsch
abgeleiteter Schlüssel wirft keine Warnung, er macht den Fall stumm unlesbar –
und das fällt erst auf, wenn ein Officer ihn öffnen will und die
Rückmeldefrist schon läuft.

Die **Fallbearbeitung** lässt sich ohne Entra und ohne SharePoint durchspielen:

```bash
python -m http.server 8773 --directory .
# dann http://localhost:8773/tests/bearbeitung.html
```

`tests/kulisse.js` legt vier Testfälle im Browserspeicher an (einer davon mit
überschrittener Frist, einer für den angemeldeten Officer nicht lesbar) und
tauscht nur die Schicht hinter `GRAPH` aus – geprüft wird der echte Code.

## Grenzen

* **Der Zugangscode ist nicht wiederherstellbar.** Er steht nirgends. Geht er
  verloren, wird der Fall weiter bearbeitet, aber die Rückmeldung nach
  § 17 Abs. 1 Nr. 6 HinSchG erreicht den Hinweisgeber nicht mehr.
* **Metadaten sind Klartext.** Datum, Thema, Gesellschaft und Status müssen
  lesbar bleiben – sonst ließe sich keine Frist überwachen. In einer kleinen
  Einheit kann ihre Kombination auf eine Person hindeuten; die Meldeseite sagt
  das und bietet „Weiß ich nicht" und „Sonstiges" an.
* **Der Text darf nicht beliebig lang sein.** Ein SharePoint-Mehrzeilenfeld
  fasst 63 999 Zeichen; die Formularfelder sind darauf abgestimmt (zusammen
  19 000 Zeichen). Wer sie vergrößert, muss das nachrechnen – eine
  abgeschnittene Chiffre ist nicht mehr zu entschlüsseln.
* **Die Trigger-URL des Flows ist faktisch öffentlich.** Wer sie kennt, kann
  Meldungen einsenden. Lesen kann er nichts.
* **Ohne Betriebsrat, DSFA und Bekanntmachung ist das Verfahren nicht fertig** –
  auch wenn die Software es ist. Siehe `RECHTSKONFORMITAET.md` Abschnitt 4.

## Verwandte Anwendungen

Gleiches Muster, gleiche Handschrift: [ZAPP](https://zapp.dihag.de) (Anmeldung
+ Graph + SharePoint) und [DIHAG Umfragen](https://umfrage.dihag.de) (anonym
über Power Automate). Diese Anwendung verbindet beide Hälften – und fügt die
Verschlüsselung hinzu, die sie für einen Meldekanal überhaupt erst zulässig
macht.
