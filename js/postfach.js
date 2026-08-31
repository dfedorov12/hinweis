"use strict";

/* Das anonyme Postfach
   ════════════════════

   Für den Hinweisgeber ist dies die einzige Verbindung zur Meldestelle –
   und weil dieses System bewusst weder Namen noch E-Mail-Adresse kennt,
   ist es zugleich der einzige Weg, auf dem die Meldestelle ihre gesetzlichen
   Pflichten erfüllen kann:

     § 17 Abs. 1 Nr. 1 HinSchG   Eingangsbestätigung   binnen 7 Tagen
     § 17 Abs. 1 Nr. 6 HinSchG   Rückmeldung           binnen 3 Monaten
     § 16 Abs. 3 HinSchG         persönliche Zusammenkunft auf Ersuchen

   Deshalb ist das Postfach hier kein Beiwerk, sondern die tragende Säule.

   Fallnummer und Code bleiben in Variablen dieser Datei. Sie stehen nicht
   in der Adresszeile (die landet im Verlauf und in jedem Proxy-Protokoll),
   nicht in localStorage und nicht in einem Cookie. Wer die Seite neu lädt,
   meldet sich neu an – das ist unbequem und genau richtig, denn ein
   Firmenrechner mit offenem Postfach wäre die größte Lücke dieses Systems. */

(() => {

  const C = HINWEIS_CONFIG;
  const $ = id => document.getElementById(id);

  let fall = null, code = null, kennung = null, fallKey = null, daten = null;

  function toast(text, fehler = false) {
    const t = $("toast");
    t.textContent = text;
    t.classList.toggle("fehler", fehler);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, fehler ? 9000 : 4000);
  }

  const datum = wert => {
    if (!wert) return "–";
    const d = new Date(wert);
    return isNaN(d) ? String(wert)
      : d.toLocaleDateString(I18N.aktuell() === "en" ? "en-GB" : "de-DE",
          { year: "numeric", month: "long", day: "numeric" });
  };

  const zeitpunkt = wert => {
    if (!wert) return "";
    const d = new Date(wert);
    return isNaN(d) ? String(wert)
      : d.toLocaleString(I18N.aktuell() === "en" ? "en-GB" : "de-DE",
          { dateStyle: "medium", timeStyle: "short" });
  };

  // ───────────────────────────────────────────────────────── Anmelden

  async function oeffnen(ereignis) {
    ereignis.preventDefault();
    const fehlerFeld = $("anmeldefehler");
    fehlerFeld.hidden = true;

    const fallEin = KRYPTO.normalisieren($("fall").value);
    const codeEin = $("code").value;

    if (!fallEin || !codeEin.trim()) {
      fehlerFeld.textContent = I18N.t("fehler.pflichtfelder", { stern: "*" });
      fehlerFeld.hidden = false;
      return;
    }

    // Erst die häufigste Ursache abfangen: abgeschriebene Zeichen, die es
    // gar nicht gibt. Ein nacktes „nicht gefunden“ wäre hier eine Zumutung –
    // der Hinweisgeber hat nur diesen einen Zettel.
    const unbekannt = [...new Set([
      ...KRYPTO.unbekannteZeichen(codeEin),
      ...KRYPTO.unbekannteZeichen($("fall").value.replace(/^\d{4}/, ""))
    ])];
    if (unbekannt.length) {
      fehlerFeld.textContent = I18N.t("postfach.fehler.zeichen",
        { zeichen: unbekannt.join(", ") });
      fehlerFeld.hidden = false;
      return;
    }

    // Die Fallnummer wird mit Bindestrichen gespeichert (2026-4K7M-9QX2),
    // eingegeben aber oft ohne. Beides muss zum selben Schlüssel führen,
    // sonst hängt der Zugang an einer Formatie.
    const fallGeformt = fallEin.length === 12
      ? `${fallEin.slice(0, 4)}-${fallEin.slice(4, 8)}-${fallEin.slice(8)}`
      : $("fall").value.trim().toUpperCase();

    const knopf = $("btnOeffnen");
    knopf.disabled = true;
    knopf.textContent = I18N.t("postfach.oeffnet");

    try {
      const k = await KRYPTO.codeKennung(codeEin, fallGeformt);
      const antwort = await API.postfach(fallGeformt, k);

      const paket = JSON.parse(antwort.schluessel || "{}");
      if (!paket.hg) throw new Error(I18N.t("postfach.fehler.entschluesseln"));

      // Hier entscheidet sich alles: Nur wenn der Code stimmt, lässt sich
      // der Fallschlüssel auspacken. Der Server hat ihn nie gesehen.
      fallKey = await KRYPTO.mitCodeOeffnen(paket.hg, codeEin, fallGeformt);

      fall = fallGeformt;
      code = codeEin;
      kennung = k;
      daten = antwort;

      await fallZeigen();

    } catch (e) {
      const meldung = /nicht gefunden|not found/i.test(e.message || "")
        ? I18N.t("postfach.fehler.nichtgefunden")
        : (e.name === "OperationError" || /decrypt|entschl/i.test(e.message || ""))
          ? I18N.t("postfach.fehler.entschluesseln")
          : (e.message || String(e));
      fehlerFeld.textContent = meldung;
      fehlerFeld.hidden = false;
    } finally {
      knopf.disabled = false;
      knopf.textContent = I18N.t("postfach.oeffnen");
    }
  }

  // ────────────────────────────────────────────────────────── Anzeigen

  async function fallZeigen() {
    $("anmeldung").hidden = true;
    $("fallbereich").hidden = false;

    $("fallNr").textContent = fall;
    $("fallEingang").textContent = datum(daten.eingang);

    const status = daten.status || "Neu";
    const merkmal = $("fallStatus");
    merkmal.textContent = I18N.t("status." + status);
    merkmal.className = "merkmal " + (
      status === "Abgeschlossen" ? "m-zu" :
      status === "Abgewiesen"    ? "m-still" :
      status === "Rückfrage"     ? "m-frist" :
      status === "Neu"           ? "m-neu" : "m-offen");

    // Die zugesagte Rückmeldefrist gehört dem Hinweisgeber. Sie zu zeigen
    // ist kein Service, sondern der einzige Weg, auf dem er überprüfen
    // kann, ob die Meldestelle ihre Frist einhält.
    const abgeschlossen = status === "Abgeschlossen" || status === "Abgewiesen";
    $("zeileRueckmeldung").hidden = abgeschlossen || !daten.rueckmeldungBis;
    $("fallFrist").textContent = datum(daten.rueckmeldungBis);

    const darfSchreiben = daten.rueckfragen !== false && !abgeschlossen;
    $("antwortbereich").hidden = !darfSchreiben;
    $("antwortzu").hidden = darfSchreiben;

    await verlaufZeichnen();
    await meldungZeigen();
  }

  async function verlaufZeichnen() {
    const box = $("verlauf");
    box.innerHTML = "";

    const liste = daten.nachrichten || [];
    if (!liste.length) {
      const p = document.createElement("p");
      p.className = "leise";
      p.textContent = I18N.t("postfach.keine");
      box.appendChild(p);
      return;
    }

    for (const n of liste) {
      let text;
      try {
        const inhalt = await KRYPTO.oeffnen(fallKey, n.chiffre);
        text = inhalt.text || "";
      } catch {
        // Eine einzelne unlesbare Nachricht darf nicht das ganze Postfach
        // sprengen – der Rest des Verlaufs ist womöglich der wichtige Teil.
        text = "[Diese Nachricht ließ sich nicht entschlüsseln.]";
      }

      const div = document.createElement("div");
      const vonMeldestelle = n.richtung === "Meldestelle";
      div.className = "nachricht " + (vonMeldestelle ? "n-meldestelle" : "n-hinweisgeber");

      const kopf = document.createElement("div");
      kopf.className = "kopfzeile";
      kopf.textContent = (vonMeldestelle
        ? I18N.t("postfach.meldestelle") : I18N.t("postfach.sie"))
        + " · " + zeitpunkt(n.gesendet);

      const p = document.createElement("p");
      p.textContent = text;

      div.append(kopf, p);
      box.appendChild(div);
    }
    box.lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  /** Die eigene Meldung noch einmal lesbar machen.
   *  Das ist mehr als Bequemlichkeit: Wer nach zwei Monaten gefragt wird
   *  „was genau meinten Sie mit …“, muss nachsehen können, was er geschrieben
   *  hat. Ohne das wäre der anonyme Dialog in der Praxis wertlos.          */
  async function meldungZeigen() {
    const dl = $("meldungsinhalt");
    dl.innerHTML = "";
    let inhalt;
    try {
      inhalt = await KRYPTO.oeffnen(fallKey, daten.chiffre);
    } catch {
      dl.textContent = I18N.t("postfach.fehler.entschluesseln");
      return;
    }

    const felder = [
      ["feld.was", inhalt.was],
      ["feld.wer", inhalt.wer],
      ["feld.wann", inhalt.wann],
      ["feld.wo", inhalt.wo],
      ["feld.wie", inhalt.wie],
      ["feld.lieferant", inhalt.lieferant],
      ["feld.belege", inhalt.belege]
    ];
    for (const [schluessel, wert] of felder) {
      if (!wert) continue;
      const dt = document.createElement("dt");
      dt.textContent = I18N.t(schluessel);
      const dd = document.createElement("dd");
      dd.textContent = wert;
      dl.append(dt, dd);
    }
    if ((inhalt.anhaenge || []).length) {
      const dt = document.createElement("dt");
      dt.textContent = I18N.t("feld.anhaenge");
      const dd = document.createElement("dd");
      dd.textContent = inhalt.anhaenge.map(a => a.name).join(", ");
      dl.append(dt, dd);
    }
  }

  // ─────────────────────────────────────────────────────────── Senden

  async function senden() {
    const feld = $("antwort");
    const text = feld.value.trim();
    if (!text) return;

    const fehlerFeld = $("sendefehler");
    fehlerFeld.hidden = true;
    const knopf = $("btnSenden");
    knopf.disabled = true;

    try {
      const chiffre = await KRYPTO.schliessen(fallKey, { text });
      await API.nachricht(fall, kennung, chiffre);

      // Örtlich anhängen statt neu laden: Ein zweiter Abruf würde nur
      // dasselbe holen und den Code erneut durch die Ableitung schicken.
      (daten.nachrichten = daten.nachrichten || []).push({
        richtung: "Hinweisgeber", chiffre, gesendet: new Date().toISOString()
      });
      feld.value = "";
      await verlaufZeichnen();
      toast(I18N.t("postfach.gesendet"));
    } catch (e) {
      fehlerFeld.textContent = e.message || String(e);
      fehlerFeld.hidden = false;
    } finally {
      knopf.disabled = false;
    }
  }

  function schliessen() {
    // Alles aus dem Speicher nehmen und die Seite neu laden. Der
    // Fallschlüssel ist ein CryptoKey – ihn zu überschreiben genügt, damit
    // niemand am selben Rechner nach dem Weggehen weiterlesen kann.
    fall = code = kennung = fallKey = daten = null;
    location.reload();
  }

  // ─────────────────────────────────────────────────────────── Aufbau

  document.addEventListener("DOMContentLoaded", () => {
    I18N.start();
    $("externerLink").href = C.externeMeldestelle.url;

    $("oeffnen").addEventListener("submit", oeffnen);
    $("btnSenden").addEventListener("click", senden);
    $("btnSchliessen").addEventListener("click", schliessen);

    // Fallnummer beim Tippen gleich in Form bringen. Wer sie von einem
    // Zettel abschreibt, tippt selten die Bindestriche mit.
    $("fall").addEventListener("blur", e => {
      const roh = KRYPTO.normalisieren(e.target.value);
      if (roh.length === 12) {
        e.target.value = `${roh.slice(0, 4)}-${roh.slice(4, 8)}-${roh.slice(8)}`;
      }
    });

    document.addEventListener("sprachwechsel", async () => {
      if (fallKey) await fallZeigen();
    });
  });
})();
