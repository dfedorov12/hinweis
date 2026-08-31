# Power-Automate-Flow „Hinweis-Annahme"

Der Flow ist das einzige Bindeglied zwischen der öffentlichen Meldeseite und
SharePoint. Er nimmt anonyme Meldungen entgegen und schreibt sie mit **seinem**
Verbindungskonto in die Listen. Genau daher kommt die Anonymität: Die meldende
Person meldet sich nirgends an; in SharePoint steht bei jedem Fall dasselbe
technische Konto, nicht der Absender.

**Der Flow ist Briefkasten, nicht Mitleser.** Sachverhalt, Nachrichten und
Anhänge sind bereits im Browser verschlüsselt, wenn sie hier ankommen. Selbst
wer den Ausführungsverlauf des Flows öffnet, findet dort Base64 und keinen Satz
Klartext. Das ist Absicht und der Grund, warum ein Flow für diesen Zweck
überhaupt vertretbar ist.

```
Handy / privater PC              Power Automate                  SharePoint
──────────────────────           ───────────────────────         ─────────────────
index.html                       „Wenn eine HTTP-Anforderung
  │  POST (JSON als                empfangen wird"
  │  text/plain)            ──►    ├─ start     ──────────────►  Bearbeiter (PubKeys)
  │                                │                             Konfiguration
  │                                ├─ meldung   ──────────────►  Hinweis_Faelle
  │                                │                └─ Anhänge ► Hinweis_Anlagen
postfach.html                      ├─ postfach  ──────────────►  Faelle + Nachrichten
  │                                └─ nachricht ──────────────►  Hinweis_Nachrichten
  ◄── Antwort mit CORS-Kopf
```

---

## 0. Voraussetzungen

| Punkt | Bemerkung |
|---|---|
| **Lizenz** | Der Trigger „Wenn eine HTTP-Anforderung empfangen wird" (Connector „Anforderung") ist **Premium**. Ohne passende Lizenz lässt sich der Flow bauen, aber nicht dauerhaft betreiben. Siehe „Alternative ohne Premium" am Ende. |
| **Verbindungskonto** | Ein Konto mit Schreibrecht auf die Meldestellen-Site – sinnvollerweise `administrator@dihag.com` wie beim ZAPP-Cron. Dieses Konto erscheint bei **jedem** Fall als „Erstellt von". |
| **Listen** | `provision-hinweis-listen.ps1` muss gelaufen sein. |
| **Umgebung** | Am besten eine Lösung („Solution") in der Standardumgebung, damit der Flow nicht an einem persönlichen Konto hängt. Scheidet die Person aus, die den Flow besitzt, steht sonst der Meldekanal – und ein Meldekanal, der steht, ist ein Rechtsverstoß. |

> ### Bevor Sie anfangen: einmal „Sichere Eingaben" einschalten
> Trigger anklicken → **Einstellungen** → **Sichere Eingaben: Ein**. Ebenso bei
> jeder Aktion, die `outputs('Nutzlast')` verwendet, unter **Sichere Ausgaben**.
>
> Wirkung: Der Ausführungsverlauf zeigt die Inhalte nicht mehr an. Zwar ist
> ohnehin alles Wesentliche verschlüsselt, aber Gesellschaft, Thema und Uhrzeit
> stehen im Klartext in der Nutzlast. In der Summe – „am Dienstag um 22:40 kam
> aus Meuselwitz eine Meldung zum Thema Führungsverhalten" – kann das in einem
> kleinen Werk genügen, um auf eine Person zu schließen. Der Ausführungsverlauf
> ist für jeden Miteigentümer des Flows sichtbar; das ist ein größerer Kreis,
> als es § 8 HinSchG zulässt.

---

## 1. Trigger anlegen

1. <https://make.powerautomate.com> öffnen, links **Erstellen**.
2. **Sofortiger Cloud-Flow** wählen – *nicht* „Automatisierter Cloud-Flow".
   Dort taucht der Trigger nicht auf.
3. Namen vergeben („Hinweis-Annahme"), im Suchfeld **„Anforderung"** (englisch
   *Request*) eingeben und **„Wenn eine HTTP-Anforderung empfangen wird"**
   auswählen.

Einstellungen:

* Methode: **POST**
* Anforderungstext-JSON-Schema: **leer lassen**

> **Warum kein Schema?** Die Meldeseite schickt den Rumpf bewusst als
> `Content-Type: text/plain`. Damit gilt die Anfrage im Browser als „einfache"
> CORS-Anfrage und die OPTIONS-Vorabanfrage entfällt, die Power Automate nicht
> brauchbar beantwortet. Der Rumpf ist trotzdem JSON und wird im nächsten
> Schritt selbst geparst.

---

## 2. Nutzlast parsen

**Aktion „Verfassen" (Compose)** einfügen und **umbenennen in `Nutzlast`**
(drei Punkte am Kopf der Aktion → *Umbenennen*):

```
json(triggerBody())
```

> ### Namen sind hier keine Kosmetik
> Alle folgenden Ausdrücke sprechen die Aktion über ihren Namen an. Heißt sie
> weiter „Verfassen", muss überall `outputs('Verfassen')` stehen – sonst liefert
> der Ausdruck nichts, und zwar **ohne Fehlermeldung**. Leerzeichen werden im
> Ausdruck zu Unterstrichen: aus „Elemente abrufen" wird `body('Elemente_abrufen')`.

*Klemmt es?* Wenn `triggerBody()` nicht als Text ankommt, hilft
`json(string(triggerBody()))`. Unter „Rohe Eingaben" in der Historie sieht man,
was tatsächlich angekommen ist.

Erreichbar sind danach:

```
outputs('Nutzlast')?['aktion']        start | meldung | postfach | nachricht
outputs('Nutzlast')?['fall']
outputs('Nutzlast')?['kennung']
outputs('Nutzlast')?['thema']
outputs('Nutzlast')?['gesellschaft']
outputs('Nutzlast')?['chiffre']
outputs('Nutzlast')?['schluessel']
outputs('Nutzlast')?['anhaenge']      Liste aus { nr, daten }
outputs('Nutzlast')?['meta']?['dauerSek']
outputs('Nutzlast')?['meta']?['hp']
```

---

## 3. Verzweigen nach Aktion

**Steuerung → Umschalten (Switch)**

* Feld **„Ein"** über **fx**: `outputs('Nutzlast')?['aktion']`
* Vier Fälle: `start`, `meldung`, `postfach`, `nachricht`
* **Standard** fängt alles Übrige ab.

> Der **Name** des Falls oben im Kästchen ist gleichgültig. Entscheidend ist
> allein der Wert im Feld **„Ist gleich"**, und der muss exakt so lauten wie
> oben: klein geschrieben, ohne Anführungszeichen, ohne Leerzeichen.

Der fertige Flow im Überblick:

```
manual  (Wenn eine HTTP-Anforderung empfangen wird)
└─ Nutzlast            Verfassen: json(triggerBody())
└─ Wechseln  auf  outputs('Nutzlast')?['aktion']
   ├─ Fall "start"
   │   ├─ Bearbeiter abrufen     (Hinweis_Bearbeiter, Filter Aktiv eq 1)
   │   ├─ Konfiguration abrufen  (Hinweis_Konfiguration)
   │   └─ Antwort  { gesellschaften, themen, bearbeiter }
   ├─ Fall "meldung"
   │   └─ Bedingung „darf angenommen werden"
   │       ├─ Wahr   → Fall suchen (Doppelvergabe?)
   │       │           └─ Bedingung „Nummer noch frei"
   │       │               ├─ Wahr  → Element erstellen (Hinweis_Faelle)
   │       │               │          → Auf jedes Element anwenden (Anhänge)
   │       │               │             └─ Datei erstellen (Hinweis_Anlagen)
   │       │               │          → Element erstellen (Dokumentation)
   │       │               │          → Antwort { ok: true }
   │       │               └─ Falsch → Antwort { ok:false, "Bitte erneut senden" }
   │       └─ Falsch → Antwort { ok: false }
   ├─ Fall "postfach"
   │   ├─ Fall suchen   (Title eq … and CodeKennung eq …)
   │   └─ Bedingung „gefunden"
   │       ├─ Wahr   → Nachrichten abrufen → Antwort (Fall + Nachrichten)
   │       └─ Falsch → Antwort { ok: false, "nicht gefunden" }
   ├─ Fall "nachricht"
   │   ├─ Fall suchen   (Title eq … and CodeKennung eq …)
   │   └─ Bedingung „gefunden und Rückfragen erlaubt"
   │       ├─ Wahr   → Element erstellen (Hinweis_Nachrichten)
   │       │           → Element aktualisieren (Status = Rueckfrage)
   │       │           → Antwort { ok: true }
   │       └─ Falsch → Antwort { ok: false }
   └─ Standard
       └─ Antwort  { ok:false, "Unbekannte Aktion" }
```

Jeder Zweig endet mit **genau einer** Antwort-Aktion. Fehlt sie, wartet der
Browser bis zum Zeitüberschreiten – und die meldende Person sieht einen Fehler,
obwohl gespeichert wurde.

---

## 4. Fall `start`

Liefert die Auswahllisten und die **öffentlichen** Schlüssel. Ohne diese
Antwort zeigt die Meldeseite gar kein Formular an.

**SharePoint → „Elemente abrufen"**, umbenennen in `Bearbeiter abrufen`:

* Websiteadresse: `https://dihag.sharepoint.com/sites/Meldestelle`
* Liste: `Hinweis_Bearbeiter`
* Filterabfrage: `Aktiv eq 1`

**SharePoint → „Elemente abrufen"**, umbenennen in `Konfiguration abrufen`:

* Liste: `Hinweis_Konfiguration`
* Sortieren nach: `Reihenfolge`

**Antwort** (Rumpf komplett über **fx** eingeben, als ein Ausdruck):

```
json(concat('{"ok":true,"gesellschaften":',
  string(xpath(xml(json(concat('{"r":{"i":',
    string(select(filter(body('Konfiguration_abrufen')?['value'],
      item()?['Art']?['Value']), item()?['Title'])), '}}'))), '//i/text()')),
  '}'))
```

> ### Das ist unnötig kompliziert – nehmen Sie lieber diesen Weg
> Der obige Ausdruck funktioniert, ist aber nicht zu pflegen. Einfacher und
> besser lesbar: drei **Verfassen**-Aktionen, danach eine schlichte Antwort.
>
> **Verfassen** `Gesellschaften`:
> ```
> select(filter(body('Konfiguration_abrufen')?['value'], equals(item()?['Art']?['Value'], 'Gesellschaft')), item()?['Title'])
> ```
> **Verfassen** `Themen`:
> ```
> select(filter(body('Konfiguration_abrufen')?['value'], equals(item()?['Art']?['Value'], 'Thema')), item()?['Title'])
> ```
> **Verfassen** `Schluessel` – hier werden bewusst nur drei Felder
> herausgegeben. Namen und E-Mail-Adressen der Compliance Officer gehören
> **nicht** in eine Antwort, die jeder Unangemeldete abrufen kann:
> ```
> select(filter(body('Bearbeiter_abrufen')?['value'], not(empty(item()?['PubKey']))), json(concat('{"id":"', item()?['ID'], '","pub":"', item()?['PubKey'], '","gesellschaften":', string(split(item()?['Gesellschaften'], '; ')), '}')))
> ```
>
> **Antwort**-Rumpf (normales Textfeld, kein fx):
> ```json
> {
>   "ok": true,
>   "gesellschaften": @{outputs('Gesellschaften')},
>   "themen": @{outputs('Themen')},
>   "bearbeiter": @{outputs('Schluessel')}
> }
> ```

> **`item()?['Art']?['Value']`, nicht `item()?['Art']`.** `Art` ist eine
> Auswahlspalte, und der SharePoint-Connector liefert dafür kein Wort, sondern
> ein Objekt `{"Id":1,"Value":"Gesellschaft"}`. Ohne `?['Value']` vergleicht man
> ein Objekt mit einem Text – das trifft nie zu, die Listen bleiben leer, und
> die Meldeseite meldet „kein Compliance Officer hinterlegt", obwohl in
> SharePoint alles richtig aussieht. Das ist die unangenehmste Sorte Fehler.

> **Die `id` muss die SharePoint-Element-ID sein** (`item()?['ID']`). Unter
> genau diesem Schlüssel legt der Browser den verpackten Fallschlüssel ab, und
> `js/schluessel.js` sucht ihn später mit `String(eintrag.id)` wieder. Wird hier
> etwas anderes eingesetzt – die E-Mail-Adresse etwa –, verschlüsselt die
> Meldeseite fleißig weiter und **kein einziger Fall lässt sich mehr öffnen**.
> Das fällt erst auf, wenn die erste echte Meldung da ist.

---

## 5. Fall `meldung`

### 5.1 Bedingung „darf angenommen werden"

* linkes Feld über **fx**:
  ```
  and(empty(coalesce(outputs('Nutzlast')?['meta']?['hp'], '')), greaterOrEquals(int(coalesce(outputs('Nutzlast')?['meta']?['dauerSek'], 0)), 15), not(empty(outputs('Nutzlast')?['chiffre'])), not(empty(outputs('Nutzlast')?['kennung'])))
  ```
* Operator: **ist gleich**, rechtes Feld: `true`

| Teil | Sinn |
|---|---|
| `empty(… ['hp'] …)` | Honigtopf – ein unsichtbares Feld, das nur Automaten ausfüllen |
| `greaterOrEquals(… 15)` | Ein Sachverhalt in unter 15 Sekunden ist keiner. Die Seite verlangt 20; hier steht 15, damit eine langsame Uhr nicht zu Unrecht abweist |
| `not(empty(chiffre/kennung))` | Ein Fall ohne Chiffre oder ohne Kennung wäre eine Karteileiche, die niemand mehr öffnen kann |

### 5.2 Doppelte Fallnummer ausschließen

Die Fallnummer entsteht im Browser aus Zufall. Bei acht Zeichen aus einem
31er-Alphabet ist eine Kollision extrem unwahrscheinlich – aber wenn sie
einträte, hätten zwei Menschen dasselbe Postfach und läsen die Meldung des
jeweils anderen. Das ist kein Restrisiko, das man eingehen muss, wenn eine
Suchabfrage genügt.

**SharePoint → „Elemente abrufen"**, umbenennen in `Doppelt pruefen`:

* Liste: `Hinweis_Faelle`
* Filterabfrage: `Title eq '@{outputs('Nutzlast')?['fall']}'`
* Anzahl der Elemente: `1`

**Bedingung** `empty(body('Doppelt_pruefen')?['value'])` **ist gleich** `true`.

Im **Falsch**-Zweig eine Antwort mit
`{ "ok": false, "fehler": "Bitte senden Sie die Meldung noch einmal ab." }` –
die Seite erzeugt dann eine neue Nummer.

### 5.3 Element erstellen (`Hinweis_Faelle`)

| Spalte | Wert | wie eintragen |
|---|---|---|
| Title | `@{outputs('Nutzlast')?['fall']}` | Textfeld |
| Art Value | `@{outputs('Nutzlast')?['art']}` | Textfeld |
| Thema | `@{outputs('Nutzlast')?['thema']}` | Textfeld |
| Gesellschaft | `@{outputs('Nutzlast')?['gesellschaft']}` | Textfeld |
| Status Value | `Neu` | fester Text |
| CodeKennung | `@{outputs('Nutzlast')?['kennung']}` | Textfeld |
| Chiffre | `@{outputs('Nutzlast')?['chiffre']}` | Textfeld |
| SchluesselJson | `@{outputs('Nutzlast')?['schluessel']}` | Textfeld |
| Rueckfragen | `if(equals(outputs('Nutzlast')?['rueckfragen'], true), true, false)` | **fx** |
| Treffen | `if(equals(outputs('Nutzlast')?['treffen'], true), true, false)` | **fx** |
| Eingang | `utcNow()` | **fx** |
| EingangsbestaetigungAm | `utcNow()` | **fx** |
| RueckmeldungBis | `addDays(utcNow(), 90)` | **fx** |
| AnzahlAnhaenge | `length(coalesce(outputs('Nutzlast')?['anhaenge'], json('[]')))` | **fx** |

> ### Zahlen-, Datums- und Ja/Nein-Felder: nur über fx, ohne `@{}`
> Sonst scheitert schon das **Speichern** des Flows mit
> `OpenApiOperationParameterValidationFailed … 'String' is not convertible to
> type/format 'Number/double'`.
>
> Grund: `@{…}` heißt „setze das Ergebnis in einen **Text** ein". Für
> `RueckmeldungBis` (Datum) oder `AnzahlAnhaenge` (Zahl) muss aber der reine
> Wert ankommen. Feld **leeren**, auf **fx** klicken, Ausdruck *ohne*
> geschweifte Klammern eingeben.
>
> Und: **kein Leerzeichen und kein Tabulator davor.** Steht auch nur ein
> Tabulator vor dem Ausdruck, wird wieder Text daraus; die Fehlermeldung zeigt
> das als `'"\t@addDays(…)"'`. Passiert leicht beim Kopieren aus dieser Tabelle.

> **Warum `EingangsbestaetigungAm` sofort gesetzt wird:** § 17 Abs. 1 Nr. 1
> HinSchG verlangt die Eingangsbestätigung binnen sieben Tagen. Sie erfolgt
> hier unmittelbar – auf dem Bestätigungsbildschirm mit Fallnummer und
> Zugangscode und danach dauerhaft sichtbar im anonymen Postfach. Eine E-Mail
> gibt es nicht, weil das System bewusst keine E-Mail-Adresse erhebt. Die
> Bestätigung ist damit nicht schwächer, sondern früher.

### 5.4 Anhänge ablegen

**Steuerung → Auf jedes Element anwenden**, über **fx**:
```
coalesce(outputs('Nutzlast')?['anhaenge'], json('[]'))
```

Darin **SharePoint → „Datei erstellen"**:

* Bibliothek: `Hinweis_Anlagen`
* Ordnerpfad: `/@{outputs('Nutzlast')?['fall']}`
* Dateiname: `@{items('Auf_jedes_Element_anwenden')?['nr']}.bin`
* Dateiinhalt über **fx**: `base64ToBinary(items('Auf_jedes_Element_anwenden')?['daten'])`

> Der **Dateiname ist bewusst eine bloße Nummer**. Der echte Name steckt im
> verschlüsselten Inhalt des Falls. Hieße die Datei
> `Protokoll_Nachtschicht_Halle2.pdf`, führte eine Spur an der Verschlüsselung
> vorbei – Dateinamen stehen in SharePoint im Klartext und tauchen in der Suche
> auf.

### 5.5 Dokumentation

**SharePoint → „Element erstellen"** in `Hinweis_Dokumentation`:

| Spalte | Wert |
|---|---|
| Title | `@{outputs('Nutzlast')?['fall']}` |
| Fallnummer | `@{outputs('Nutzlast')?['fall']}` |
| Aktion | `Meldung eingegangen` |
| Einzelheiten | `Über das anonyme Webformular. Inhalt verschlüsselt. Eingangsbestätigung sofort erteilt.` |
| Akteur | `System (Flow)` |
| Zeitpunkt | `utcNow()` (**fx**) |

### 5.6 Benachrichtigung der zuständigen Officer (optional, empfohlen)

Ein Meldesystem, in das niemand hineinschaut, verfehlt seinen Zweck – und die
Drei-Monats-Frist läuft ab dem Eingang, nicht ab dem ersten Blick.

**Auf jedes Element anwenden** über `body('Bearbeiter_abrufen')?['value']`
(dafür muss die Aktion aus Schritt 4 auch in diesem Fall stehen – am
einfachsten vor den Switch ziehen), darin eine **Bedingung**
```
or(contains(item()?['Gesellschaften'], outputs('Nutzlast')?['gesellschaft']), contains(item()?['Gesellschaften'], '*'))
```
und im Wahr-Zweig **„E-Mail senden (V2)"**:

* An: `@{item()?['Title']}`
* Betreff: `Neue Meldung @{outputs('Nutzlast')?['fall']}`
* Rumpf:
  ```
  Im Hinweisgebersystem liegt eine neue Meldung vor.

  Fallnummer:   @{outputs('Nutzlast')?['fall']}
  Gesellschaft: @{outputs('Nutzlast')?['gesellschaft']}
  Eingegangen:  @{utcNow()}

  Bitte in der Fallbearbeitung ansehen:
  https://hinweis.dihag.de/bearbeitung.html
  ```

> **Niemals Fallinhalte in diese Mail.** Sie läuft unverschlüsselt über
> Exchange, liegt im Postfach und im Backup und ist für jeden
> Postfachadministrator lesbar. Das Thema steht deshalb bewusst **nicht**
> darin – „Gesellschaft + Uhrzeit" ist schon grenzwertig, „Thema:
> Führungsverhalten" wäre in einem kleinen Werk eine Vorverurteilung.

---

## 6. Fall `postfach`

**SharePoint → „Elemente abrufen"**, umbenennen in `Fall suchen`:

* Liste: `Hinweis_Faelle`
* Filterabfrage:
  ```
  Title eq '@{outputs('Nutzlast')?['fall']}' and CodeKennung eq '@{outputs('Nutzlast')?['kennung']}'
  ```
* Anzahl: `1`

> **Beide Bedingungen zusammen** – die Fallnummer allein genügt nicht. Sie ist
> nur acht Zeichen lang und steht auf einem Zettel, den man verlieren kann. Die
> Kennung ist die Ableitung aus dem Zugangscode und der eigentliche Nachweis.

**Verfassen** `Fall`: `first(body('Fall_suchen')?['value'])`

**Bedingung** `empty(body('Fall_suchen')?['value'])` **ist gleich** `false`.

Im **Wahr**-Zweig **„Elemente abrufen"** (`Nachrichten abrufen`):

* Liste: `Hinweis_Nachrichten`
* Filterabfrage: `Fallnummer eq '@{outputs('Nutzlast')?['fall']}'`
* Sortieren nach: `Gesendet`

**Antwort**:

```json
{
  "ok": true,
  "status": "@{outputs('Fall')?['Status']?['Value']}",
  "eingang": "@{outputs('Fall')?['Eingang']}",
  "rueckmeldungBis": "@{outputs('Fall')?['RueckmeldungBis']}",
  "rueckfragen": @{if(equals(outputs('Fall')?['Rueckfragen'], true), true, false)},
  "chiffre": "@{outputs('Fall')?['Chiffre']}",
  "schluessel": "@{outputs('Fall')?['SchluesselJson']}",
  "nachrichten": @{select(body('Nachrichten_abrufen')?['value'], json(concat('{"richtung":"', item()?['Richtung']?['Value'], '","chiffre":"', item()?['Chiffre'], '","gesendet":"', item()?['Gesendet'], '"}')))}
}
```

> **Die Anführungszeichen um `@{…}` sind wichtig.** Ohne sie steht dort
> `"chiffre": @{…}`, und das ist kein gültiges JSON mehr – der Entwurf lehnt die
> Aktion mit **„Ungültige Parameter"** ab. Bei `rueckfragen` und `nachrichten`
> ist es umgekehrt: Dort soll ein echter Wahrheitswert bzw. ein Array stehen,
> deshalb dort **ohne** Anführungszeichen.

Im **Falsch**-Zweig:
```json
{ "ok": false, "fehler": "Zu dieser Fallnummer und diesem Code wurde nichts gefunden." }
```

---

## 7. Fall `nachricht`

Dieselbe Suche wie in Schritt 6 (die Aktion lässt sich nicht zweimal gleich
benennen – nennen Sie sie `Fall suchen 2`).

**Bedingung** über **fx**:
```
and(not(empty(body('Fall_suchen_2')?['value'])), equals(first(body('Fall_suchen_2')?['value'])?['Rueckfragen'], true), not(empty(outputs('Nutzlast')?['chiffre'])))
```
**ist gleich** `true`.

Im Wahr-Zweig **„Element erstellen"** in `Hinweis_Nachrichten`:

| Spalte | Wert | wie |
|---|---|---|
| Title | `@{outputs('Nutzlast')?['fall']}` | Text |
| Fallnummer | `@{outputs('Nutzlast')?['fall']}` | Text |
| Richtung Value | `Hinweisgeber` | fester Text |
| Chiffre | `@{outputs('Nutzlast')?['chiffre']}` | Text |
| Gesendet | `utcNow()` | **fx** |

Danach **„Element aktualisieren"** in `Hinweis_Faelle`: Id
`first(body('Fall_suchen_2')?['value'])?['ID']` (**fx**), Status auf
`In Bearbeitung` – aber **nur**, wenn er nicht schon `Abgeschlossen` oder
`Abgewiesen` ist. Dafür eine Bedingung davor:
```
not(contains(createArray('Abgeschlossen','Abgewiesen'), first(body('Fall_suchen_2')?['value'])?['Status']?['Value']))
```

Antwort: `{ "ok": true }` bzw. im Falsch-Zweig
`{ "ok": false, "fehler": "Die Nachricht wurde nicht angenommen." }`.

---

## 8. Die Antwort-Aktion (in jedem Zweig gleich aufgebaut)

**Anforderung → Antwort**

* Statuscode: **200** – auch bei Ablehnung. Der Rumpf sagt mit `ok: false`, was
  los ist. Ein 4xx ohne CORS-Kopf kann der Browser gar nicht lesen und meldet
  nur „Netzwerkfehler".
* **Kopfzeilen** (unverzichtbar):

  | Schlüssel | Wert |
  |---|---|
  | `Access-Control-Allow-Origin` | `https://hinweis.dihag.de` |
  | `Content-Type` | `application/json` |

  Anders als bei der Umfrage-Anwendung steht hier **nicht** `*`. Es gibt nur
  eine produktive Adresse, und ein Hinweisgebersystem ist kein Ort für
  Bequemlichkeit: Mit `*` könnte eine beliebige fremde Seite im Namen des
  Besuchers Meldungen einsenden oder Postfächer durchprobieren, ohne dass der
  Browser das unterbindet. Für Tests von `http://localhost:8773` legt man
  vorübergehend einen zweiten Wert an – und nimmt ihn danach wieder heraus.

---

## 9. URL eintragen

Nach dem **Speichern** zeigt der Trigger die „HTTP-POST-URL". Diese Adresse in
`js/config.js` eintragen:

```js
endpunkt: "https://prod-xx.westeurope.logic.azure.com:443/workflows/…&sig=…",
```

Danach verschwindet auf der Meldeseite der Hinweis „Probelauf".

> Die URL enthält die Signatur `sig=…` und ist damit faktisch öffentlich – sie
> steht im Quelltext der Seite. Das ist beim Trigger „HTTP-Anforderung" nicht zu
> vermeiden und der Preis dafür, dass sich niemand anmelden muss.
>
> Was jemand mit der URL anfangen kann: Meldungen einsenden und Fallnummern
> durchprobieren. Was nicht: irgendetwas lesen. Ohne den Zugangscode gibt der
> Endpunkt nichts heraus, und selbst mit einem Treffer wäre die Chiffre ohne
> Schlüssel wertlos. Bei Missbrauch im Trigger „Regenerate key" klicken und die
> neue URL eintragen.

---

## 10. Test ohne Browser

```bash
curl -s -X POST "<HTTP-POST-URL>" -H "Content-Type: text/plain" --data '{"aktion":"start"}'
```

Erwartet: `{"ok":true,"gesellschaften":[…],"themen":[…],"bearbeiter":[{"id":"1","pub":"MIIBIjAN…","gesellschaften":["*"]}]}`

```bash
curl -s -X POST "<HTTP-POST-URL>" -H "Content-Type: text/plain" --data '{"aktion":"postfach","fall":"2026-XXXX-XXXX","kennung":"0000"}'
```

Erwartet: `{"ok":false,…}` – ein erfundener Fall darf nichts zurückgeben.

**Vollständig prüfen lässt sich das System am besten über die Oberfläche:**
eine Meldung absenden, den Zettel notieren, das Postfach damit öffnen. Wenn der
eigene Sachverhalt dort wieder lesbar erscheint, stimmt die ganze Kette.

---

## 11. Häufige Stolpersteine

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Meldeseite: „kein Compliance Officer hinterlegt" | Noch kein Schlüsselpaar angelegt, oder `?['Value']` bei der Auswahlspalte `Art` vergessen | CCO meldet sich in `bearbeitung.html` an und legt den Schlüssel an; Ausdruck prüfen |
| Fälle kommen an, lassen sich aber **nicht öffnen** | In `bearbeiter` wurde etwas anderes als `item()?['ID']` als `id` geliefert | Ausdruck in Schritt 4 korrigieren. Bereits eingegangene Fälle sind verloren – vor dem Echtbetrieb unbedingt einen Probefall durchspielen |
| Speichern scheitert: `'String' is not convertible to 'Number/double'` | Zahlen-/Datumsfeld hat Text bekommen (`@{…}` oder Tabulator davor) | Feld leeren, **fx**, Ausdruck ohne `@{}` |
| Aktion zeigt „Ungültige Parameter" | Antwortrumpf ist kein gültiges JSON – meist `"chiffre": @{…}` ohne Anführungszeichen | Anführungszeichen setzen (Schritt 6) |
| Browser meldet „CORS-Fehler" / „Failed to fetch" | Antwort ohne `Access-Control-Allow-Origin`, oder falsche Herkunft eingetragen | Kopfzeile in **allen** Antwort-Aktionen ergänzen |
| Postfach findet nichts, obwohl der Fall existiert | `CodeKennung` in der Filterabfrage vergessen oder Groß-/Kleinschreibung der Fallnummer | Filter prüfen; die Seite normalisiert die Eingabe auf Großbuchstaben |
| `outputs('Nutzlast')` ist leer | Rumpf kam nicht als Text an | `json(string(triggerBody()))`; „Rohe Eingaben" in der Historie ansehen |
| Anhänge fehlen | Ordnerpfad ohne führenden Schrägstrich, oder `base64ToBinary` vergessen | Schritt 5.4 |
| Alles läuft, aber die Seite meldet Zeitüberschreitung | In einem Zweig fehlt die Antwort-Aktion | Schritt 3, letzter Absatz |

---

## Alternative ohne Premium-Lizenz

Falls der Request-Trigger lizenzrechtlich nicht geht, ändert sich **nur** dieser
Baustein – Meldeseite, Postfach und Bearbeitung bleiben unverändert. Nötig ist
irgendein Endpunkt, der ein Geheimnis halten kann:

1. **Azure Function (Verbrauchsplan)** oder **Logic App (Consumption)** –
   App-only per Client Credentials gegen Microsoft Graph, Client-Secret in den
   App-Settings. Die vorhandene Registrierung „DIHAG Cron-Job" hat mit
   `Sites.Selected` bereits das passende Muster. Kosten bei diesem Aufkommen:
   Cent-Bereich. **Für ein Hinweisgebersystem ist das ohnehin die sauberere
   Lösung** – ein Function-Endpunkt kann eine Ratenbegrenzung, und die fehlt
   dem Power-Automate-Trigger.
2. Microsoft Forms scheidet hier aus, anders als bei der Umfrage-Anwendung:
   Forms kann nicht clientseitig verschlüsseln, und ohne Verschlüsselung
   verliert das System seine tragende Eigenschaft.

Der Vertrag zwischen Seite und Endpunkt (Abschnitte 2 bis 8) bleibt in jedem
Fall derselbe: JSON rein, `{ok:…}` raus, CORS-Kopf dran.
