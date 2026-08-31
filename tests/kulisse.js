"use strict";

/* Kulisse für die Fallbearbeitung
   ═══════════════════════════════

   Ersetzt Entra und SharePoint durch einen Speicher im Browser, damit sich
   die Bearbeitungsseite prüfen lässt, ohne einen echten Fall anzulegen.

   Das ist keine Bequemlichkeit: Ein Hinweisgebersystem lässt sich nicht
   „mal eben in der Produktion testen". Jeder Probefall wäre eine Zeile in
   der echten Fallliste, würde echte Fristen auslösen und stünde in der
   Dokumentation, die später jemand prüft. Also wird hier geprobt.

   Aufgesetzt wird auf den ECHTEN Dateien – js/krypto.js, js/schluessel.js,
   js/bearbeitung.js laufen unverändert. Getauscht wird nur, was hinter
   GRAPH liegt. Sonst würde der Test eine Nachbildung prüfen statt der
   Anwendung.

   Aufruf: tests/bearbeitung.html im Browser öffnen.
   Passphrase des Testkontos: siehe PASSPHRASE unten.                       */

const PASSPHRASE = "Kulisse fuer den Probelauf 2026";

window.KULISSE = (() => {

  const tage = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  // Speicher: je Liste ein Array von Zeilen mit fortlaufender id
  const db = { };
  let naechsteId = 1;

  const anlegenRoh = (liste, felder) => {
    (db[liste] ||= []).push({ id: String(naechsteId++), ...felder });
    return db[liste][db[liste].length - 1];
  };

  const anhangSpeicher = {};   // "fall/nr" -> Base64-Chiffre

  async function aufbauen() {
    const C = HINWEIS_CONFIG;

    // ── Drei Compliance Officer
    const cco = anlegenRoh(C.lists.bearbeiter, {
      Title: "cco@dihag.com", Anzeigename: "Chief Compliance Officer",
      Rolle: "Chief Compliance Officer", Gesellschaften: "*", Aktiv: true
    });
    const lokal = anlegenRoh(C.lists.bearbeiter, {
      Title: "co.meuselwitz@dihag.com", Anzeigename: "CO Meuselwitz",
      Rolle: "Compliance Officer",
      Gesellschaften: "MEUSELWITZ GUSS Eisengießerei GmbH", Aktiv: true
    });
    const ohneSchluessel = anlegenRoh(C.lists.bearbeiter, {
      Title: "co.arnstadt@dihag.com", Anzeigename: "CO Arnstadt",
      Rolle: "Compliance Officer",
      Gesellschaften: "EWA Eisenwerk Arnstadt GmbH", Aktiv: true
    });

    // Der CCO ist das angemeldete Konto und bekommt ein echtes Schlüsselpaar.
    const paar = await KRYPTO.paarErzeugen(PASSPHRASE);
    Object.assign(cco, {
      PubKey: paar.pubB64, PrivKeyEnc: paar.privEnc,
      PrivKeyNot: paar.privNot, KdfSalt: paar.salz,
      SchluesselAm: new Date().toISOString()
    });
    // Der lokale Officer ebenfalls – sonst ließe sich das Freigeben nicht prüfen.
    const paar2 = await KRYPTO.paarErzeugen(PASSPHRASE);
    Object.assign(lokal, {
      PubKey: paar2.pubB64, PrivKeyEnc: paar2.privEnc,
      PrivKeyNot: paar2.privNot, KdfSalt: paar2.salz
    });
    void ohneSchluessel;   // hat bewusst KEINEN Schlüssel

    // ── Konfiguration
    for (const g of ["DIHAG Holding GmbH", "MEUSELWITZ GUSS Eisengießerei GmbH",
      "SHB Stahl- und Hartgusswerk Bösdorf GmbH", "EWA Eisenwerk Arnstadt GmbH",
      "DIHAG Zaigler GmbH", "DIHAG Eisenberg GmbH",
      "Weiß ich nicht / gesellschaftsübergreifend"]) {
      anlegenRoh(C.lists.konfiguration, { Title: g, Art: "Gesellschaft" });
    }
    for (const t of ["Korruption", "Arbeitssicherheit", "Umweltschutz",
      "Diskriminierung, Mobbing", "Verstöße in der Lieferkette", "Sonstiges"]) {
      anlegenRoh(C.lists.konfiguration, { Title: t, Art: "Thema" });
    }

    // ── Fälle so anlegen, wie es die Meldeseite tut
    async function fallAnlegen(o) {
      const fall = KRYPTO.fallnummer();
      const code = KRYPTO.zugangscode();
      const fk = await KRYPTO.fallSchluessel();
      const chiffre = await KRYPTO.schliessen(fk, o.inhalt);

      const tabelle = { hg: await KRYPTO.fuerCodeVerpacken(fk, code, fall) };
      for (const b of o.fuer) {
        tabelle[String(b.id)] = await KRYPTO.fuerBearbeiterVerpacken(fk, b.PubKey);
      }

      const zeile = anlegenRoh(C.lists.faelle, {
        Title: fall,
        Eingang: o.eingang,
        Art: o.art || "Hinweis",
        Thema: o.thema,
        Gesellschaft: o.gesellschaft,
        Status: o.status || "Neu",
        Rueckfragen: o.rueckfragen !== false,
        Treffen: !!o.treffen,
        CodeKennung: await KRYPTO.codeKennung(code, fall),
        Chiffre: chiffre,
        SchluesselJson: JSON.stringify(tabelle),
        EingangsbestaetigungAm: o.eingang,
        RueckmeldungBis: o.rueckmeldungBis,
        AnzahlAnhaenge: o.anhang ? 1 : 0
      });

      if (o.anhang) {
        anhangSpeicher[`${fall}/1`] =
          await KRYPTO.schliessenBinaer(fk, new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]));
      }
      for (const n of (o.nachrichten || [])) {
        anlegenRoh(C.lists.nachrichten, {
          Title: fall, Fallnummer: fall, Richtung: n.von,
          Chiffre: await KRYPTO.schliessen(fk, { text: n.text }),
          Gesendet: n.am
        });
      }
      anlegenRoh(C.lists.dokumentation, {
        Title: fall, Fallnummer: fall, Aktion: "Meldung eingegangen",
        Einzelheiten: "Über das anonyme Webformular, verschlüsselt.",
        Akteur: "System", Zeitpunkt: o.eingang
      });
      return { fall, code };
    }

    // 1) Frischer Fall, für CCO und lokalen Officer lesbar, mit Anhang
    KULISSE.probe1 = await fallAnlegen({
      eingang: tage(-3), rueckmeldungBis: tage(87),
      thema: "Korruption", gesellschaft: "MEUSELWITZ GUSS Eisengießerei GmbH",
      treffen: true, anhang: true, fuer: [cco, lokal],
      inhalt: {
        was: "Der Einkäufer hat vom Lieferanten eine Reise nach Mallorca angenommen "
           + "(Größenordnung 4.000 €). Das wiederholt sich seit zwei Jahren.",
        wer: "Einkauf, Herr X, Lieferant Y GmbH",
        wann: "Frühjahr 2025, seither jährlich",
        wo: "Meuselwitz", wie: "Abstimmung lief über eine private E-Mail-Adresse.",
        lieferant: "Y GmbH", belege: "Es gibt Fotos in einem internen Chat.",
        sprache: "de",
        anhaenge: [{ name: "Beleg_Reise.pdf", typ: "application/pdf", groesse: 7 }]
      }
    });

    // 2) Fall mit überschrittener Rückmeldefrist – prüft die Fristenanzeige
    KULISSE.probe2 = await fallAnlegen({
      eingang: tage(-120), rueckmeldungBis: tage(-30), status: "In Bearbeitung",
      thema: "Arbeitssicherheit", gesellschaft: "MEUSELWITZ GUSS Eisengießerei GmbH",
      fuer: [cco, lokal],
      nachrichten: [
        { von: "Meldestelle", text: "Vielen Dank. Können Sie die Schicht eingrenzen?",
          am: tage(-110) },
        { von: "Hinweisgeber", text: "Es war die Nachtschicht, zweite Wochenhälfte.",
          am: tage(-108) }
      ],
      inhalt: {
        was: "Die Absaugung an Ofen 3 läuft seit Wochen nicht.",
        wer: "Gießerei, Schichtführung", wann: "seit Januar", wo: "Halle 2",
        wie: "", lieferant: "", belege: "", sprache: "de", anhaenge: []
      }
    });

    // 3) Fall einer anderen Gesellschaft, NICHT für den lokalen Officer –
    //    zeigt in der Übersicht „nicht lesbar", wenn man als CO anmeldet.
    KULISSE.probe3 = await fallAnlegen({
      eingang: tage(-40), rueckmeldungBis: tage(50), status: "In Bearbeitung",
      thema: "Umweltschutz", gesellschaft: "EWA Eisenwerk Arnstadt GmbH",
      fuer: [cco],
      inhalt: {
        was: "Kühlwasser wird ohne Messung abgelassen.",
        wer: "Instandhaltung", wann: "laufend", wo: "Arnstadt",
        wie: "", lieferant: "", belege: "", sprache: "de", anhaenge: []
      }
    });

    // 4) Abgeschlossener Fall ohne Rückfragen – prüft den gesperrten Dialog
    KULISSE.probe4 = await fallAnlegen({
      eingang: tage(-200), rueckmeldungBis: tage(-110), status: "Abgeschlossen",
      thema: "Sonstiges", gesellschaft: "DIHAG Holding GmbH",
      rueckfragen: false, fuer: [cco],
      inhalt: {
        was: "Frage zur Annahme von Werbegeschenken.", wer: "", wann: "", wo: "",
        wie: "", lieferant: "", belege: "", sprache: "de", anhaenge: []
      }
    });
    const p4 = db[C.lists.faelle].find(f => f.Title === KULISSE.probe4.fall);
    Object.assign(p4, {
      Ergebnis: "Kein Verstoß feststellbar", Massnahme: "Keine Maßnahme erforderlich",
      AbschlussAm: tage(-150), LoeschenAm: tage(945), Art: "Anfrage"
    });

  }

  const protokoll = [];

  /* GRAPH SOFORT umlenken, den Aufbau aber nebenher laufen lassen.
     Der Grund ist ein Zeitproblem, das sonst schwer zu finden wäre: Das
     Erzeugen zweier RSA-Schlüsselpaare dauert einen Moment, DOMContentLoaded
     wartet darauf nicht – und js/bearbeitung.js hängt sich genau daran auf.
     Käme die Umlenkung erst danach, würde die Seite den echten Graph
     ansprechen und mit einem Anmeldefehler stehen bleiben.

     Deshalb: Die Attrappen stehen von der ersten Zeile an, und jede einzelne
     wartet intern, bis die Testdaten fertig sind.                          */
  HINWEIS_CONFIG.clientId = "kulisse";
  const bereit = aufbauen();
  bereit.catch(e => {
    console.error("[KULISSE] Aufbau fehlgeschlagen:", e);
    document.body.insertAdjacentHTML("afterbegin",
      `<div style="background:#b02a37;color:#fff;padding:10px 20px">
         KULISSE konnte nicht aufgebaut werden: ${e.message}</div>`);
  });

  GRAPH.anmelden = async () => { await bereit; return { username: "cco@dihag.com" }; };
  GRAPH.abmelden = () => location.reload();
  GRAPH.ich = async () => {
    await bereit;
    return { displayName: "Chief Compliance Officer",
             mail: "cco@dihag.com", userPrincipalName: "cco@dihag.com" };
  };
  GRAPH.elemente = async liste => {
    await bereit;
    // Tiefe Kopie: So kann die Anwendung an ihren Objekten herumschreiben,
    // ohne dass die „Datenbank" davon etwas mitbekommt – genau wie bei
    // echtem SharePoint, wo Änderungen erst durch aendern() wirksam werden.
    return JSON.parse(JSON.stringify(db[liste] || []));
  };
  GRAPH.anlegen = async (liste, felder) => {
    await bereit;
    protokoll.push(["anlegen", liste, felder]);
    return anlegenRoh(liste, felder);
  };
  GRAPH.aendern = async (liste, id, felder) => {
    await bereit;
    protokoll.push(["aendern", liste, id, felder]);
    const z = (db[liste] || []).find(x => x.id === String(id));
    if (!z) throw new Error(`Zeile ${id} in ${liste} nicht gefunden`);
    Object.assign(z, felder);
    return z;
  };
  GRAPH.loeschen = async (liste, id) => {
    await bereit;
    db[liste] = (db[liste] || []).filter(x => x.id !== String(id));
  };
  GRAPH.anlageLesen = async (fall, nr) => {
    await bereit;
    const d = anhangSpeicher[`${fall}/${nr}`];
    if (!d) throw new Error("Anhang nicht vorhanden");
    return d;
  };
  GRAPH.mailSenden = async (an, betreff) => protokoll.push(["mail", an, betreff]);

  return { bereit, db, protokoll, PASSPHRASE,
           zeilen: liste => db[liste] || [] };
})();
