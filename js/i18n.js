"use strict";

/* Zweisprachigkeit der öffentlichen Seiten (Deutsch / Englisch)
   ═════════════════════════════════════════════════════════════

   Warum überhaupt Englisch? Nicht als Zugabe, sondern weil der
   Adressatenkreis es verlangt: § 8 LkSG erwartet ein Beschwerdeverfahren,
   das auch den Beschäftigten von Lieferanten offensteht – und die
   Themenliste enthält ausdrücklich „Verstöße in der Lieferkette".
   Ein Meldekanal, den die betroffene Person nicht lesen kann, ist keiner.

   Die Bearbeitungsseite bleibt einsprachig deutsch: Sie richtet sich an die
   Compliance Officer der Gruppe, und Rechtsbegriffe wie „Rückmeldung nach
   § 17 Abs. 1 Nr. 6" zu übersetzen würde mehr Unschärfe erzeugen als Nutzen.

   Bedienung im HTML:
     <span data-t="schluessel">                Text ersetzen
     <input data-t-platzhalter="schluessel">   Platzhalter ersetzen
     <a data-t-titel="schluessel">             title-Attribut ersetzen
   Fehlt ein Schlüssel, bleibt der im HTML stehende deutsche Text stehen –
   eine fehlende Übersetzung soll eine Lücke sein, kein leeres Feld.        */

const I18N = (() => {

  const TEXTE = {

    de: {
      /* Kopf und Navigation */
      "nav.melden": "Hinweis geben",
      "nav.postfach": "Mein Postfach",
      "nav.datenschutz": "Datenschutz",
      "marke.name": "Hinweisgebersystem",
      "marke.zusatz": "DIHAG Foundry Group",

      /* Startseite / Formular */
      "melden.titel": "Hinweis oder Anfrage eingeben",
      "melden.untertitel":
        "Dieses Meldesystem ist vollständig anonym. Es gibt keine Anmeldung, "
        + "keine Namensabfrage und keine E-Mail-Abfrage.",

      "anon.titel": "So bleiben Sie anonym",
      "anon.text":
        "Ihre Angaben werden bereits in Ihrem Browser verschlüsselt und können nur von "
        + "den zuständigen Compliance Officern geöffnet werden. Weder die IT-Abteilung "
        + "noch die Geschäftsführung noch der Betreiber dieser Seite können mitlesen. "
        + "Wir speichern keine IP-Adresse, setzen keine Cookies und binden nichts von "
        + "fremden Servern ein.",
      "anon.warnung":
        "Achten Sie selbst darauf, in den Textfeldern nichts zu schreiben, woran man Sie "
        + "erkennen könnte – etwa „ich als einziger Nachtschichtführer“. Wenn Sie sich zu "
        + "erkennen geben möchten, steht Ihnen das frei: Schreiben Sie Ihren Namen einfach "
        + "in den Sachverhalt. Gefragt werden Sie danach nicht.",
      "anon.geraet":
        "Nutzen Sie möglichst ein privates Gerät und keinen Firmenrechner. Diese Seite "
        + "verrät nichts über Sie – aber ein Firmennetz kann protokollieren, welche "
        + "Adressen aufgerufen wurden.",

      "feld.art": "Es handelt sich um",
      "feld.art.hinweis": "Hinweis",
      "feld.art.hinweis.hilfe": "Sie melden einen konkreten Verstoß oder Verdacht.",
      "feld.art.anfrage": "Anfrage",
      "feld.art.anfrage.hilfe": "Sie haben eine Frage zu Recht, Regeln oder Verhalten.",

      "feld.thema": "Thema",
      "feld.thema.hilfe": "Wenn nichts genau passt, wählen Sie „Sonstiges“.",
      "feld.gesellschaft": "Betroffene Gesellschaft",
      "feld.gesellschaft.hilfe":
        "Danach richtet sich, welcher Compliance Officer zuständig ist. Im Zweifel "
        + "„Weiß ich nicht“ wählen – dann übernimmt der Chief Compliance Officer.",
      "waehlen": "– bitte wählen –",

      "feld.rueckfragen": "Rückfragen zulassen",
      "feld.rueckfragen.hilfe":
        "Empfohlen. Sie erhalten ein anonymes Postfach, in dem die Meldestelle "
        + "nachfragen und Ihnen das Ergebnis mitteilen kann – ohne dass Ihre Identität "
        + "bekannt wird. Ohne Rückfragen können wir Sie nicht mehr erreichen.",
      "feld.treffen": "Persönliches Treffen gewünscht",
      "feld.treffen.hilfe":
        "Sie haben ein Recht darauf (§ 16 Abs. 3 HinSchG). Ort und Zeit vereinbaren wir "
        + "über das anonyme Postfach.",

      "abschnitt.sachverhalt": "Was ist geschehen?",
      "feld.was": "Was? (Sachverhalt)",
      "feld.was.hilfe":
        "Bitte schildern Sie so genau wie möglich, was vorgefallen ist. Je konkreter, "
        + "desto eher lässt sich der Sachverhalt aufklären.",
      "feld.wer": "Wer ist davon betroffen? (Abteilung, Gesellschaft, beteiligte Personen)",
      "feld.wann": "Wann hat sich dies ereignet? (Zeitpunkt, Dauer)",
      "feld.wo": "Wo? (Land, Standort, Stadt)",
      "feld.wie": "Wie? (Beschreibung der Vorgehensweise)",
      "feld.lieferant": "Welcher Lieferant ist an dem Sachverhalt beteiligt?",
      "feld.belege": "Kann der Sachverhalt durch andere objektive Umstände belegt werden?",

      "feld.anhaenge": "Dateien anhängen",
      "feld.anhaenge.hilfe":
        "Höchstens {max} Dateien, je bis {mb} MB. Die Dateien werden vor dem Hochladen "
        + "verschlüsselt. Denken Sie daran, dass Office-Dateien und Fotos Ihren Namen "
        + "oder Ihren Standort enthalten können.",
      "anhang.entfernen": "Entfernen",
      "anhang.zugross": "„{name}“ ist mit {mb} MB zu groß (erlaubt sind {max} MB).",
      "anhang.zuviele": "Es sind höchstens {max} Dateien möglich.",

      "feld.freischalten": "Formular freischalten",
      "feld.freischalten.hilfe":
        "Bitte ziehen Sie den Schieber ganz nach rechts. Das ersetzt ein Captcha – ein "
        + "Captcha müsste von einem fremden Server geladen werden und würde diesem "
        + "verraten, dass Sie hier gerade eine Meldung schreiben.",
      "schieber.zu": "Noch nicht freigeschaltet",
      "schieber.auf": "Freigeschaltet",

      "absenden": "Meldung verschlüsselt absenden",
      "absenden.laeuft": "Wird verschlüsselt und gesendet …",

      "fehler.pflicht": "Bitte füllen Sie dieses Feld aus.",
      "fehler.pflichtfelder": "Bitte füllen Sie die mit {stern} gekennzeichneten Felder aus.",
      "fehler.schieber": "Bitte schalten Sie das Formular über den Schieber frei.",
      "fehler.zuschnell":
        "Das ging sehr schnell. Bitte prüfen Sie Ihre Angaben und senden Sie erneut.",
      "fehler.senden": "Die Meldung konnte nicht gesendet werden: {grund}",
      "laden.start": "Sichere Verbindung wird vorbereitet …",
      "fehler.start":
        "Das Meldeformular kann gerade nicht geöffnet werden: {grund} Bitte versuchen Sie "
        + "es später erneut. Sie können sich jederzeit auch an die externe Meldestelle wenden.",

      /* Bestätigung */
      "danke.titel": "Ihre Meldung ist eingegangen",
      "danke.eingang":
        "Damit ist der Eingang Ihrer Meldung bestätigt (§ 17 Abs. 1 Nr. 1 HinSchG). "
        + "Innerhalb von drei Monaten erhalten Sie eine Rückmeldung darüber, welche "
        + "Maßnahmen ergriffen wurden.",
      "danke.code.beschriftung": "Ihr Zugangscode",
      "danke.fall": "Fallnummer",
      "danke.warnung.titel": "Bitte jetzt notieren – der Code wird nirgends gespeichert",
      "danke.warnung.text":
        "Mit Fallnummer und Zugangscode öffnen Sie Ihr anonymes Postfach. Nur darüber "
        + "können wir Sie erreichen. Wir können den Code nicht wiederherstellen und nicht "
        + "zurücksetzen: Er existiert ausschließlich auf diesem Bildschirm. Geht er "
        + "verloren, bleibt Ihre Meldung in Bearbeitung, aber der Rückweg zu Ihnen ist zu.",
      "danke.drucken": "Zettel drucken",
      "danke.kopieren": "Code kopieren",
      "danke.kopiert": "Kopiert.",
      "danke.datei": "Als Datei speichern",
      "danke.zumpostfach": "Postfach öffnen",
      "danke.probelauf":
        "Probelauf: Diese Meldung wurde NICHT gespeichert. In js/config.js ist noch kein "
        + "Endpunkt eingetragen.",

      /* Postfach */
      "postfach.titel": "Anonymes Postfach",
      "postfach.untertitel":
        "Hier sehen Sie den Stand Ihrer Meldung und können mit der Meldestelle schreiben "
        + "– weiterhin anonym.",
      "postfach.fall": "Fallnummer",
      "postfach.code": "Zugangscode",
      "postfach.oeffnen": "Postfach öffnen",
      "postfach.oeffnet": "Wird geöffnet …",
      "postfach.hinweis.code":
        "Beides steht auf dem Zettel, den Sie nach dem Absenden erhalten haben. Groß- und "
        + "Kleinschreibung und die Bindestriche spielen keine Rolle.",
      "postfach.fehler.nichtgefunden":
        "Zu dieser Fallnummer und diesem Code wurde nichts gefunden. Bitte prüfen Sie "
        + "beide Angaben Zeichen für Zeichen.",
      "postfach.fehler.zeichen":
        "Diese Zeichen kommen in unseren Codes nicht vor: {zeichen}. Verwechselt werden "
        + "häufig 0 und O, 1 und I. Wir verwenden weder 0, 1, I, L noch O.",
      "postfach.fehler.entschluesseln":
        "Der Fall wurde gefunden, ließ sich aber mit diesem Code nicht öffnen. Bitte "
        + "prüfen Sie den Zugangscode.",
      "postfach.status": "Stand",
      "postfach.eingegangen": "Eingegangen am",
      "postfach.rueckmeldung": "Rückmeldung zugesagt bis",
      "postfach.neue": "Neue Nachricht der Meldestelle",
      "postfach.antwort": "Ihre Antwort an die Meldestelle",
      "postfach.antwort.platzhalter": "Nachricht schreiben …",
      "postfach.senden": "Verschlüsselt senden",
      "postfach.gesendet": "Nachricht gesendet.",
      "postfach.zu":
        "Für diese Meldung wurden keine Rückfragen zugelassen. Sie können hier nur den "
        + "Stand einsehen.",
      "postfach.meldestelle": "Meldestelle",
      "postfach.sie": "Sie",
      "postfach.abmelden": "Postfach schließen",
      "postfach.keine": "Bisher keine Nachrichten.",
      "postfach.meldung.text": "Ihre Meldung",

      /* Status */
      "status.Neu": "Eingegangen",
      "status.In Bearbeitung": "In Bearbeitung",
      "status.Rückfrage": "Rückfrage an Sie",
      "status.Abgeschlossen": "Abgeschlossen",
      "status.Abgewiesen": "Nicht weiterverfolgt",

      /* Fuß */
      "fuss.datenschutz": "Datenschutz",
      "fuss.extern": "Externe Meldestelle",
      "fuss.betrieb": "Betrieben von der DIHAG Foundry Group",
      "fuss.extern.hinweis":
        "Sie können sich statt an uns auch unmittelbar an die externe Meldestelle "
        + "des Bundes wenden. Dieser Weg steht Ihnen immer offen."
    },

    en: {
      "nav.melden": "Report a concern",
      "nav.postfach": "My mailbox",
      "nav.datenschutz": "Privacy",
      "marke.name": "Whistleblowing system",
      "marke.zusatz": "DIHAG Foundry Group",

      "melden.titel": "Submit a report or question",
      "melden.untertitel":
        "This reporting system is fully anonymous. There is no login, and we never ask "
        + "for your name or e-mail address.",

      "anon.titel": "How your anonymity is protected",
      "anon.text":
        "Your entries are encrypted in your own browser and can only be opened by the "
        + "responsible compliance officers. Neither the IT department nor management nor "
        + "the operator of this website can read them. We store no IP address, set no "
        + "cookies and load nothing from third-party servers.",
      "anon.warnung":
        "Please make sure you do not write anything in the text fields that would "
        + "identify you – for example “as the only night shift supervisor”. You are of "
        + "course free to identify yourself: simply write your name into the description. "
        + "We will not ask for it.",
      "anon.geraet":
        "If possible, use a private device rather than a company computer. This page "
        + "reveals nothing about you – but a company network may log which addresses "
        + "were visited.",

      "feld.art": "This is",
      "feld.art.hinweis": "A report",
      "feld.art.hinweis.hilfe": "You are reporting a specific breach or suspicion.",
      "feld.art.anfrage": "A question",
      "feld.art.anfrage.hilfe": "You have a question about law, rules or conduct.",

      "feld.thema": "Topic",
      "feld.thema.hilfe": "If nothing fits exactly, choose “Other”.",
      "feld.gesellschaft": "Company concerned",
      "feld.gesellschaft.hilfe":
        "This determines which compliance officer is responsible. If in doubt choose "
        + "“I don’t know” – the Chief Compliance Officer will then take over.",
      "waehlen": "– please choose –",

      "feld.rueckfragen": "Allow follow-up questions",
      "feld.rueckfragen.hilfe":
        "Recommended. You will receive an anonymous mailbox in which the reporting office "
        + "can ask questions and give you the outcome – without learning who you are. "
        + "Without it we cannot reach you again.",
      "feld.treffen": "I would like a personal meeting",
      "feld.treffen.hilfe":
        "You are entitled to one (Section 16(3) German Whistleblower Protection Act). We "
        + "arrange place and time through the anonymous mailbox.",

      "abschnitt.sachverhalt": "What happened?",
      "feld.was": "What? (the facts)",
      "feld.was.hilfe":
        "Please describe as precisely as possible what happened. The more concrete your "
        + "description, the better the matter can be investigated.",
      "feld.wer": "Who is affected? (department, company, people involved)",
      "feld.wann": "When did this happen? (date, duration)",
      "feld.wo": "Where? (country, site, city)",
      "feld.wie": "How? (description of how it was done)",
      "feld.lieferant": "Which supplier is involved?",
      "feld.belege": "Can the matter be substantiated by other objective circumstances?",

      "feld.anhaenge": "Attach files",
      "feld.anhaenge.hilfe":
        "At most {max} files, up to {mb} MB each. Files are encrypted before upload. "
        + "Remember that Office documents and photos may contain your name or location.",
      "anhang.entfernen": "Remove",
      "anhang.zugross": "“{name}” is {mb} MB and therefore too large (limit {max} MB).",
      "anhang.zuviele": "At most {max} files are possible.",

      "feld.freischalten": "Unlock the form",
      "feld.freischalten.hilfe":
        "Please drag the slider all the way to the right. This replaces a captcha – a "
        + "captcha would have to be loaded from a third-party server and would tell that "
        + "server you are writing a report right now.",
      "schieber.zu": "Not yet unlocked",
      "schieber.auf": "Unlocked",

      "absenden": "Encrypt and send report",
      "absenden.laeuft": "Encrypting and sending …",

      "fehler.pflicht": "Please complete this field.",
      "fehler.pflichtfelder": "Please complete the fields marked with {stern}.",
      "fehler.schieber": "Please unlock the form using the slider.",
      "fehler.zuschnell":
        "That was very quick. Please check your entries and send again.",
      "fehler.senden": "The report could not be sent: {grund}",
      "laden.start": "Preparing a secure connection …",
      "fehler.start":
        "The reporting form cannot be opened at the moment: {grund} Please try again "
        + "later. You may also contact the external reporting office at any time.",

      "danke.titel": "Your report has been received",
      "danke.eingang":
        "This confirms receipt of your report (Section 17(1) no. 1 German Whistleblower "
        + "Protection Act). Within three months you will receive feedback on the action "
        + "taken.",
      "danke.code.beschriftung": "Your access code",
      "danke.fall": "Case number",
      "danke.warnung.titel": "Write this down now – the code is stored nowhere",
      "danke.warnung.text":
        "The case number and access code open your anonymous mailbox. That is the only "
        + "way we can reach you. We cannot restore or reset the code: it exists only on "
        + "this screen. If you lose it your report is still processed, but the way back "
        + "to you is closed.",
      "danke.drucken": "Print slip",
      "danke.kopieren": "Copy code",
      "danke.kopiert": "Copied.",
      "danke.datei": "Save as file",
      "danke.zumpostfach": "Open mailbox",
      "danke.probelauf":
        "Test run: this report was NOT saved. No endpoint is configured in js/config.js.",

      "postfach.titel": "Anonymous mailbox",
      "postfach.untertitel":
        "Here you can see the status of your report and write to the reporting office – "
        + "still anonymously.",
      "postfach.fall": "Case number",
      "postfach.code": "Access code",
      "postfach.oeffnen": "Open mailbox",
      "postfach.oeffnet": "Opening …",
      "postfach.hinweis.code":
        "Both are on the slip you received after sending. Capitalisation and hyphens do "
        + "not matter.",
      "postfach.fehler.nichtgefunden":
        "Nothing was found for this case number and code. Please check both entries "
        + "character by character.",
      "postfach.fehler.zeichen":
        "These characters do not occur in our codes: {zeichen}. 0 and O, 1 and I are "
        + "easily confused. We use neither 0, 1, I, L nor O.",
      "postfach.fehler.entschluesseln":
        "The case was found but could not be opened with this code. Please check the "
        + "access code.",
      "postfach.status": "Status",
      "postfach.eingegangen": "Received on",
      "postfach.rueckmeldung": "Feedback promised by",
      "postfach.neue": "New message from the reporting office",
      "postfach.antwort": "Your reply to the reporting office",
      "postfach.antwort.platzhalter": "Write a message …",
      "postfach.senden": "Send encrypted",
      "postfach.gesendet": "Message sent.",
      "postfach.zu":
        "No follow-up questions were allowed for this report. You can only view the "
        + "status here.",
      "postfach.meldestelle": "Reporting office",
      "postfach.sie": "You",
      "postfach.abmelden": "Close mailbox",
      "postfach.keine": "No messages yet.",
      "postfach.meldung.text": "Your report",

      "status.Neu": "Received",
      "status.In Bearbeitung": "Under investigation",
      "status.Rückfrage": "Question for you",
      "status.Abgeschlossen": "Closed",
      "status.Abgewiesen": "Not pursued",

      "fuss.datenschutz": "Privacy notice",
      "fuss.extern": "External reporting office",
      "fuss.betrieb": "Operated by DIHAG Foundry Group",
      "fuss.extern.hinweis":
        "Instead of using this system you may also turn directly to the federal external "
        + "reporting office. That route is always open to you."
    }
  };

  /* Die Themenliste kommt aus SharePoint und ist dort deutsch gepflegt.
     Für die englische Fassung wird sie hier übersetzt; was fehlt, bleibt
     deutsch stehen. Gespeichert wird IMMER der deutsche Wert – sonst
     stünden in der Fallliste zwei Sprachen durcheinander und jede
     Auswertung nach Themen wäre wertlos.                                  */
  const THEMEN_EN = {
    "Arbeitssicherheit": "Occupational safety",
    "Betrug, Unterschlagung": "Fraud, embezzlement",
    "Datenschutz": "Data protection",
    "Exportkontrolle, Embargo und Sanktionen": "Export control, embargo and sanctions",
    "Führungsverhalten": "Leadership conduct",
    "Geldwäsche und Terrorismusfinanzierung": "Money laundering and terrorist financing",
    "Geschäftsgeheimnisse": "Trade secrets",
    "Geschenke und Einladungen": "Gifts and invitations",
    "Gesundheitsschutz": "Health protection",
    "Informationssicherheit": "Information security",
    "Interessenkonflikte": "Conflicts of interest",
    "Kartellrecht, Wettbewerbsrecht": "Antitrust and competition law",
    "Korruption": "Corruption",
    "Kundenrechte, Verbraucherschutz": "Customer rights, consumer protection",
    "Mitarbeiterverhalten": "Employee conduct",
    "Diskriminierung, Mobbing": "Discrimination, bullying",
    "Produktsicherheit": "Product safety",
    "Qualitätsmanagement": "Quality management",
    "Strafbares Verhalten von Beschäftigten": "Criminal conduct by employees",
    "Strafbares Verhalten von Lieferanten": "Criminal conduct by suppliers",
    "Umweltschutz": "Environmental protection",
    "Verstöße in der Lieferkette": "Breaches in the supply chain",
    "Sonstiges": "Other",
    "Weiß ich nicht / gesellschaftsübergreifend": "I don’t know / affects several companies"
  };

  // Die Sprachwahl liegt in localStorage, nicht in einem Cookie: Ein Cookie
  // ginge bei jedem Aufruf mit zum Server und wäre ein – wenn auch winziges –
  // Wiedererkennungsmerkmal. localStorage bleibt im Gerät.
  const SCHLUESSEL = "hinweis.sprache";

  let sprache = "de";

  function erkennen() {
    try {
      const gemerkt = localStorage.getItem(SCHLUESSEL);
      if (gemerkt && TEXTE[gemerkt]) return gemerkt;
    } catch { /* Privater Modus – dann eben die Browsersprache */ }
    const roh = (navigator.language || "de").toLowerCase();
    return roh.startsWith("de") ? "de" : "en";
  }

  /** Text nachschlagen. `werte` füllt Platzhalter der Form {name}. */
  function t(schluessel, werte) {
    let s = TEXTE[sprache]?.[schluessel] ?? TEXTE.de[schluessel] ?? schluessel;
    if (werte) for (const [k, v] of Object.entries(werte)) s = s.split(`{${k}}`).join(v);
    return s;
  }

  /** Deutschen Listenwert für die Anzeige übersetzen. Gespeichert wird
   *  weiterhin der deutsche Wert – siehe Kommentar bei THEMEN_EN.          */
  const bezeichnung = wert => (sprache === "en" && THEMEN_EN[wert]) || wert;

  function anwenden(wurzel = document) {
    wurzel.querySelectorAll("[data-t]").forEach(el => {
      el.textContent = t(el.dataset.t);
    });
    wurzel.querySelectorAll("[data-t-platzhalter]").forEach(el => {
      el.placeholder = t(el.dataset.tPlatzhalter);
    });
    wurzel.querySelectorAll("[data-t-titel]").forEach(el => {
      el.title = t(el.dataset.tTitel);
    });
    wurzel.querySelectorAll("[data-t-aria]").forEach(el => {
      el.setAttribute("aria-label", t(el.dataset.tAria));
    });
    document.documentElement.lang = sprache;
  }

  function setzen(neu) {
    if (!TEXTE[neu]) return;
    sprache = neu;
    try { localStorage.setItem(SCHLUESSEL, neu); } catch { /* egal */ }
    anwenden();
    document.querySelectorAll(".sprachwahl button").forEach(b =>
      b.classList.toggle("aktiv", b.dataset.sprache === neu));
    document.dispatchEvent(new CustomEvent("sprachwechsel", { detail: neu }));
  }

  function start() {
    sprache = erkennen();
    document.querySelectorAll(".sprachwahl button").forEach(b => {
      b.classList.toggle("aktiv", b.dataset.sprache === sprache);
      b.addEventListener("click", () => setzen(b.dataset.sprache));
    });
    anwenden();
  }

  return { t, setzen, start, anwenden, bezeichnung, aktuell: () => sprache };
})();
