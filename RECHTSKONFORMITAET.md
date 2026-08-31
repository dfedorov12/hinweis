# Rechtskonformität – Nachweis und offene Punkte

Dieses Dokument ordnet jede gesetzliche Anforderung einer konkreten Stelle in
der Anwendung zu. Es ist als Arbeitsgrundlage für die Compliance-Funktion und
für eine spätere Prüfung gedacht.

> **Was dieses Dokument nicht ist.** Es ist keine Rechtsberatung und ersetzt
> keine anwaltliche Prüfung. Die Zuordnung stammt aus dem Aufbau der Software;
> ob die Umsetzung im konkreten Fall genügt, hängt auch an organisatorischen
> Punkten, die Software nicht leisten kann (Abschnitt 4).

---

## 1. Hinweisgeberschutzgesetz (HinSchG)

| Norm | Anforderung | Umsetzung | Fundstelle |
|---|---|---|---|
| **§ 7 Abs. 3** | Auf die externe Meldestelle ist hinzuweisen | Verweis im Fußbereich jeder Seite, in der Datenschutzerklärung und in der Fehlermeldung, wenn das Formular nicht öffnet | `index.html`, `datenschutz.html`, `js/meldung.js` |
| **§ 8 Abs. 1** | Vertraulichkeit der Identität; Kenntnis nur für zuständige Personen | Ende-zu-Ende-Verschlüsselung im Browser. Der Fallschlüssel wird nur für die zuständigen Officer verpackt. Administratoren, der Flow und jedes Backup sehen Chiffre | `js/krypto.js`, `js/meldung.js` (`zustaendige`) |
| **§ 9** | Ausnahmen vom Vertraulichkeitsgebot | Nicht automatisiert. Eine Offenlegung erfolgt organisatorisch und ist als Vermerk zu dokumentieren | Reiter *Dokumentation* |
| **§ 10** | Verarbeitung personenbezogener Daten, auch besonderer Kategorien | Zweck und Rechtsgrundlage benannt; Datenminimierung durch Verzicht auf Namens- und E-Mail-Feld | `datenschutz.html` Abschnitt 3 |
| **§ 11 Abs. 1** | Dokumentation in dauerhaft abrufbarer Weise | Eigene Liste `Hinweis_Dokumentation`, jeder Bearbeitungsschritt schreibt automatisch einen Eintrag; Einträge lassen sich in der Oberfläche nicht ändern oder löschen | `js/schluessel.js` (`DOKU`) |
| **§ 11 Abs. 5** | Löschung 3 Jahre nach Abschluss | `LoeschenAm` wird beim Abschluss gesetzt; der tägliche Lauf entfernt Chiffre, Schlüssel, Nachrichten und Anhänge | `cron/hinweis_cron.py` (`loeschfristen`) |
| **§ 12 Abs. 1** | Unabhängige Tätigkeit der beauftragten Personen | Organisatorisch. Technisch unterstützt: Der Kreis der Zugriffsberechtigten steht in `Hinweis_Bearbeiter` und **nicht** in der allgemeinen Rechteliste `AppPermissions` der übrigen Anwendungen | `js/schluessel.js`, Kopfkommentar |
| **§ 16 Abs. 1** | Meldekanal für Beschäftigte, mündlich oder in Textform | Textform über das Webformular, rund um die Uhr, ohne Anmeldung, von jedem privaten Gerät | `index.html` |
| **§ 16 Abs. 1 S. 4** | Anonyme Meldungen *sollen* bearbeitet werden | Das System kennt ausschließlich anonyme Meldungen | ganze Anwendung |
| **§ 16 Abs. 3** | Persönliche Zusammenkunft auf Ersuchen | Ankreuzfeld im Formular; die Detailansicht weist den Bearbeiter darauf hin, Ort und Zeit über das anonyme Postfach zu vereinbaren | `js/bearbeitung.js` (`dialogHinweis`) |
| **§ 17 Abs. 1 Nr. 1** | Eingangsbestätigung binnen 7 Tagen | Sofort: Bestätigungsbildschirm mit Fallnummer und Zugangscode, danach dauerhaft im Postfach sichtbar. `EingangsbestaetigungAm` wird beim Anlegen gesetzt. Der Cron meldet, falls es je fehlen sollte | Flow-Anleitung 5.3, `cron/hinweis_cron.py` |
| **§ 17 Abs. 1 Nr. 2** | Prüfung der Zuständigkeit | Auswahl der Gesellschaft steuert, welcher Officer den Fall öffnen kann | `js/meldung.js` (`zustaendige`) |
| **§ 17 Abs. 1 Nr. 3–5** | Kontakt halten, Stichhaltigkeit prüfen, weitere Auskünfte einholen | Anonymer verschlüsselter Dialog in beide Richtungen | `postfach.html`, Reiter *Nachrichten* |
| **§ 17 Abs. 1 Nr. 6** | Rückmeldung binnen 3 Monaten | `RueckmeldungBis` wird beim Anlegen auf +90 Tage gesetzt. Der Fallabschluss **verlangt** die Rückmeldung, solange ein Kanal besteht; der Cron warnt 14 Tage vorher und eskaliert bei Überschreitung an den CCO | `js/bearbeitung.js` (`abschliessen`), `cron/hinweis_cron.py` |
| **§ 18** | Folgemaßnahmen | Auswahlliste beim Fallabschluss, Auswahl wird in Statistik und Dokumentation festgehalten | `js/bearbeitung.js` (`MASSNAHMEN`) |
| **§ 27 Abs. 2** | Rückmeldung darf Untersuchung und Rechte Dritter nicht beeinträchtigen | Hinweistext direkt am Eingabefeld der Rückmeldung | `bearbeitung.html` |
| **§ 36** | Repressalienverbot samt Beweislastumkehr | Erläutert in der Datenschutzerklärung | `datenschutz.html` Abschnitt 8 |

## 2. DSGVO und BDSG

| Norm | Anforderung | Umsetzung |
|---|---|---|
| **Art. 5 Abs. 1 lit. c** | Datenminimierung | Kein Namens-, kein E-Mail-, kein Telefonfeld. Keine IP-Speicherung, keine Cookies, keine Analysewerkzeuge |
| **Art. 13** | Informationspflicht | `datenschutz.html`, von jeder Seite aus verlinkt |
| **Art. 25** | Datenschutz durch Technikgestaltung und Voreinstellungen | Anonymität ist nicht eine Option, sondern der einzige Modus. Verschlüsselung ist nicht abschaltbar: Ohne öffentlichen Schlüssel eines Officers verweigert das Formular den Dienst, statt Klartext anzunehmen |
| **Art. 30** | Verzeichnis von Verarbeitungstätigkeiten | **Muss noch erstellt werden** – siehe Abschnitt 4 |
| **Art. 32** | Sicherheit der Verarbeitung | AES-256-GCM für Inhalte, RSA-OAEP-2048 für die Schlüsselverteilung, PBKDF2-SHA256 mit 310 000 Runden für Passphrasen (150 000 für Zugangscodes mit 80 Bit Zufall). Transport über TLS. Prüfsummenschutz durch GCM erkennt Manipulation |
| **Art. 35** | Datenschutz-Folgenabschätzung | **Erforderlich** – ein Hinweisgebersystem steht auf der Muss-Liste der deutschen Aufsichtsbehörden. Siehe Abschnitt 4 |
| **§ 29 Abs. 1 BDSG** | Einschränkung der Auskunft zum Schutz des Hinweisgebers | In der Datenschutzerklärung benannt |

## 3. Lieferkettensorgfaltspflichtengesetz (LkSG)

| Norm | Anforderung | Umsetzung |
|---|---|---|
| **§ 8 Abs. 1** | Beschwerdeverfahren einrichten | Dasselbe Verfahren; Themen *Verstöße in der Lieferkette* und *Strafbares Verhalten von Lieferanten*, eigenes Feld für den beteiligten Lieferanten |
| **§ 8 Abs. 4** | Auch für Externe zugänglich, in verständlicher Sprache | Öffentlich erreichbar ohne Anmeldung, deutsch und englisch |
| **§ 8 Abs. 1 S. 5** | Vertraulichkeit, Schutz vor Benachteiligung | Wie unter HinSchG |

## 4. Was Software nicht leisten kann

Diese Punkte sind **offen** und müssen organisatorisch erledigt werden, bevor
das System in Betrieb geht. Ohne sie ist die Anwendung technisch konform, das
Verfahren als Ganzes aber nicht.

1. **Datenschutz-Folgenabschätzung nach Art. 35 DSGVO.**
   Ein Hinweisgebersystem steht auf der Liste der Verarbeitungen, für die die
   deutschen Aufsichtsbehörden eine DSFA ausdrücklich verlangen. Die
   Verschlüsselung erspart sie nicht, sie ist aber das stärkste Argument darin.

2. **Verzeichnis von Verarbeitungstätigkeiten nach Art. 30 DSGVO** ergänzen –
   die Angaben dafür stehen in `datenschutz.html` Abschnitte 2, 3 und 5.

3. **Beteiligung des Betriebsrats.** Ein System, mit dem Verhalten von
   Beschäftigten gemeldet und dokumentiert wird, ist regelmäßig
   mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 1 und Nr. 6 BetrVG). Das gilt für
   jede betroffene Gesellschaft mit Betriebsrat.

4. **Bestellung und Schulung der Meldestellen-Beauftragten** (§ 15 Abs. 2
   HinSchG: notwendige Fachkunde) sowie schriftliche Regelung ihrer
   Unabhängigkeit und Freistellung von Weisungen (§ 12 Abs. 1).

5. **Vertretungsregelung.** Fällt der einzige zuständige Officer aus, laufen
   Fristen weiter. Technisch ist vorgesorgt (jeder Fall wird immer auch für
   den Chief Compliance Officer verschlüsselt, und Fälle lassen sich
   nachträglich freigeben) – wer wen vertritt, muss aber festgelegt sein.

6. **Notfallschlüssel in den Tresor.** Beim Anlegen des Schlüsselpaars wird er
   einmalig angezeigt und danach nie wieder. Ohne Passphrase und ohne diesen
   Zettel kommt der Officer an seine Fälle nur noch über die Freigabe durch
   einen Kollegen heran.

7. **Bekanntmachung des Meldekanals.** Ein Kanal, den niemand kennt, erfüllt
   § 12 nicht. Aushang in den Werken (die Zielgruppe sitzt nicht am
   Schreibtisch), Intranet, Arbeitsvertragsanlage, Lieferantenportal.

8. **Ablauf des Client-Secrets für den Cron überwachen.** Läuft es ab, stehen
   die Fristerinnerungen still – und zwar lautlos.

9. **Aufbewahrung länger als drei Jahre** ist nur zulässig, soweit erforderlich
   und verhältnismäßig (§ 11 Abs. 5 HinSchG). Der Cron löscht ohne Rückfrage;
   soll ein Fall wegen eines laufenden Verfahrens bleiben, muss `LoeschenAm`
   vorher von Hand verschoben und der Grund als Vermerk dokumentiert werden.

## 5. Bewusst getroffene Entscheidungen und ihr Preis

Jede dieser Entscheidungen hat eine Kehrseite. Sie hier zu benennen ist Teil
der Nachweisführung – eine Prüfung, die sie später selbst findet, wiegt
schwerer als eine, der man sie zeigt.

**Kein Namens- und kein E-Mail-Feld.**
Preis: Es gibt keine Eingangsbestätigung per Mail. Wer seinen Zugangscode
verliert, ist für die Meldestelle nicht mehr erreichbar; der Fall wird zwar
weiter bearbeitet, die Rückmeldung nach § 17 Abs. 1 Nr. 6 erreicht ihn aber
nicht mehr. Deshalb ist der Code auf dem Bestätigungsbildschirm so
aufdringlich platziert und lässt sich drucken, kopieren und als Datei sichern.

**Ende-zu-Ende-Verschlüsselung.**
Preis: Fällt ein Officer mitsamt Passphrase und Notfallschlüssel aus, sind
seine Fälle für ihn verloren. Abgefedert dadurch, dass jeder Fall immer auch
für den Chief Compliance Officer verpackt wird und sich nachträglich freigeben
lässt. Ein zentrales Zurücksetzen gibt es bewusst nicht – es wäre eine
Hintertür, und eine Hintertür widerspricht § 8.

**Metadaten im Klartext.**
Datum, Thema, Gesellschaft und Status stehen unverschlüsselt in der Liste.
Ohne sie ließe sich weder die Zuständigkeit bestimmen noch eine Frist
überwachen noch die Wirksamkeit belegen. Preis: In einer kleinen
Organisationseinheit kann die Kombination aus Zeitpunkt, Gesellschaft und
Thema auf eine Person hindeuten. Die Meldeseite weist darauf hin und bietet
„Weiß ich nicht" und „Sonstiges" als Ausweg an.

**Power Automate als Annahmestelle.**
Preis: Ein Premium-Connector, dessen Trigger-URL faktisch öffentlich ist, und
ein Ausführungsverlauf, der Metadaten zeigt. Abgefedert durch „Sichere
Eingaben" und dadurch, dass der Endpunkt ohne Zugangscode nichts herausgibt.
Für den Dauerbetrieb ist eine Azure Function die sauberere Lösung – sie kann
zusätzlich eine Ratenbegrenzung, die dem Power-Automate-Trigger fehlt (siehe
`flow/ANLEITUNG-FLOW.md`, letzter Abschnitt).

**Kein Captcha.**
Preis: Der Schutz vor maschinellen Einsendungen ist schwächer (Honigtopf und
Mindestdauer statt Captcha). Ein Captcha hätte dem Anbieter jedoch verraten,
dass hier gerade jemand eine Meldung schreibt – und wer bereit ist, ein
Captcha zu lösen, löst auch dieses.
