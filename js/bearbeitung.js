"use strict";

/* Fallbearbeitung durch die Meldestelle
   ═════════════════════════════════════

   Die Oberfläche kennt drei Zustände, und der Unterschied ist wichtig:

     nicht eingetragen   kommt gar nicht herein
     eingetragen         sieht die Liste: Datum, Gesellschaft, Status, Fristen
     Schlüssel entsperrt sieht zusätzlich die Inhalte – aber nur die Fälle,
                         für die sein Schlüssel eingepackt wurde

   Der mittlere Zustand ist kein Versehen. Ein Compliance Officer aus
   Arnstadt SOLL sehen, dass in Meuselwitz drei Fälle offen sind und einer
   davon die Rückmeldefrist reißt – das ist Führungsinformation. Den
   Sachverhalt darf er nicht lesen, und er kann es auch nicht.             */

(() => {

  const C = HINWEIS_CONFIG;
  const $ = id => document.getElementById(id);

  /* Auswahllisten, die nur die Meldestelle sieht. Sie stehen hier und nicht
     in SharePoint, weil sie Teil der Auswertungslogik sind: Ändert jemand
     „Hoch" in „hoch", zerfällt jede Statistik in zwei Kategorien. */
  const BEREICHE = ["Einkauf", "Vertrieb", "Produktion", "Instandhaltung", "Logistik",
    "Personal", "Finanzen, Controlling", "IT", "Qualitätsmanagement",
    "Umwelt, Arbeitssicherheit", "Geschäftsführung", "Lieferant, Dritte", "Sonstiges"];

  const BEDEUTUNGEN = ["Gering", "Mittel", "Hoch", "Kritisch"];

  const ERGEBNISSE = ["Verstoß bestätigt, abgestellt", "Verstoß bestätigt, Maßnahmen laufen",
    "Kein Verstoß feststellbar", "Unbegründet", "Nicht in den Anwendungsbereich fallend",
    "An zuständige Stelle abgegeben", "Verfahren mangels Beweisen eingestellt"];

  const MASSNAHMEN = ["Interne Untersuchung durchgeführt", "Betroffene kontaktiert",
    "Verfahren beendet (§ 18 Nr. 4 HinSchG)", "An zuständige interne Stelle abgegeben",
    "An Behörde abgegeben (§ 18 Nr. 5 HinSchG)", "Arbeitsrechtliche Maßnahme",
    "Prozess oder Richtlinie geändert", "Keine Maßnahme erforderlich"];

  const STATUS = ["Neu", "In Bearbeitung", "Rückfrage", "Abgeschlossen", "Abgewiesen"];
  const OFFEN = ["Neu", "In Bearbeitung", "Rückfrage"];

  let faelle = [];
  let gesellschaften = [];
  let themen = [];
  let aktuell = null;        // { fall, inhalt, fallKey, nachrichten, doku }
  let filter = { status: ["Neu", "In Bearbeitung", "Rückfrage"], gesellschaften: [],
                 von: "", bis: "", nurFristig: false, aufsteigend: false };

  // ──────────────────────────────────────────────────────── Werkzeug

  function toast(text, fehler = false) {
    const t = $("toast");
    t.textContent = text;
    t.classList.toggle("fehler", fehler);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, fehler ? 9000 : 4000);
  }
  window.__dokuFehler = (aktion, e) =>
    toast(`Achtung: Der Dokumentationseintrag „${aktion}" wurde NICHT gespeichert `
      + `(${e.message}). Bitte von Hand nachtragen.`, true);

  const datum = w => {
    if (!w) return "–";
    const d = new Date(w);
    return isNaN(d) ? String(w)
      : d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
  };
  const zeitpunkt = w => {
    if (!w) return "–";
    const d = new Date(w);
    return isNaN(d) ? String(w)
      : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  };
  const heute = () => new Date(new Date().toDateString());
  const tageBis = w => w ? Math.round((new Date(w) - heute()) / 86400000) : null;

  function fuellen(select, werte, leer = null) {
    select.innerHTML = "";
    if (leer !== null) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = leer;
      select.appendChild(o);
    }
    for (const w of werte) {
      const o = document.createElement("option");
      o.value = w; o.textContent = w;
      select.appendChild(o);
    }
  }

  /** Fristzustand eines Falls – die einzige Rechenlogik, die auch ohne
   *  Schlüssel funktioniert, weil sie nur Daten aus Klartextspalten
   *  benutzt. Genau deshalb kann auch der Cron sie nachbilden.             */
  function fristLage(f) {
    if (f.Status === "Abgeschlossen" || f.Status === "Abgewiesen") return null;
    const tage = tageBis(f.RueckmeldungBis);
    if (tage === null) return null;
    if (tage < 0)  return { stufe: "ueberfaellig", tage,
      text: `Rückmeldefrist seit ${Math.abs(tage)} Tagen überschritten` };
    if (tage <= C.fristen.erinnerungVorTagen) return { stufe: "knapp", tage,
      text: `Rückmeldung in ${tage} Tag${tage === 1 ? "" : "en"} fällig` };
    return { stufe: "ok", tage, text: `Rückmeldung bis ${datum(f.RueckmeldungBis)}` };
  }

  // ─────────────────────────────────────────────────────── Ansichten

  function zeige(name) {
    document.querySelectorAll(".blick").forEach(s =>
      s.hidden = s.id !== "blick-" + name);
    document.querySelectorAll("#hauptnav a[data-blick]").forEach(a =>
      a.classList.toggle("aktiv", a.dataset.blick === name));
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-blick]");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.blick === "uebersicht") listeZeichnen();
    if (a.dataset.blick === "verwaltung") verwaltungZeichnen();
    if (a.dataset.blick === "schluessel") schluesselZeichnen();
    zeige(a.dataset.blick);
  });

  // ─────────────────────────────────────────────────────── Schlüssel

  async function schluesselZeichnen() {
    const hat = SCHLUESSEL.hatSchluessel();
    const auf = SCHLUESSEL.istEntsperrt();
    $("kastenAnlegen").hidden = hat;
    $("kastenEntsperren").hidden = !hat || auf;
    $("kastenSchluesselOk").hidden = !auf;
    $("kastenNotfall").hidden = true;

    if (auf) {
      $("skKonto").textContent = SCHLUESSEL.ich.email;
      $("skRolle").textContent = SCHLUESSEL.ich.rolle;
      $("skGesellschaften").textContent = SCHLUESSEL.ich.gesellschaften.includes("*")
        ? "alle Gesellschaften" : SCHLUESSEL.ich.gesellschaften.join(", ") || "–";
      $("skFinger").textContent =
        await KRYPTO.fingerabdruck(SCHLUESSEL.ich.eintrag.PubKey);
    }
  }

  async function paarAnlegen() {
    const f = $("anlegenFehler");
    f.hidden = true;
    const p1 = $("ppNeu").value, p2 = $("ppNeu2").value;
    if (p1.length < 12) {
      f.textContent = "Die Passphrase muss mindestens 12 Zeichen haben.";
      f.hidden = false; return;
    }
    if (p1 !== p2) {
      f.textContent = "Die beiden Eingaben stimmen nicht überein.";
      f.hidden = false; return;
    }
    const knopf = $("btnPaarAnlegen");
    knopf.disabled = true;
    knopf.textContent = "Schlüssel wird erzeugt …";
    try {
      const erg = await SCHLUESSEL.paarAnlegen(p1);
      $("ppNeu").value = $("ppNeu2").value = "";
      $("kastenAnlegen").hidden = true;
      $("kastenNotfall").hidden = false;
      $("notfallCode").textContent = erg.notfall;
      $("fingerabdruckNeu").textContent = erg.fingerabdruck;
    } catch (e) {
      f.textContent = e.message; f.hidden = false;
    } finally {
      knopf.disabled = false;
      knopf.textContent = "Schlüsselpaar anlegen";
    }
  }

  async function entsperren() {
    const f = $("entsperrFehler");
    f.hidden = true;
    const knopf = $("btnEntsperren");
    knopf.disabled = true;
    knopf.textContent = "Wird entsperrt …";
    try {
      await SCHLUESSEL.entsperren($("ppEin").value, $("mitNotfall").checked);
      $("ppEin").value = "";
      await schluesselZeichnen();
      await fallListeLaden();
      toast("Schlüssel entsperrt.");
      zeige("uebersicht");
      listeZeichnen();
    } catch (e) {
      f.textContent = e.message; f.hidden = false;
    } finally {
      knopf.disabled = false;
      knopf.textContent = "Entsperren";
    }
  }

  // ──────────────────────────────────────────────────── Fallübersicht

  async function fallListeLaden() {
    faelle = (await GRAPH.elemente(C.lists.faelle))
      .filter(f => f.Title)
      .filter(f => SCHLUESSEL.istCCO() || SCHLUESSEL.ich.hauptAdmin
        || SCHLUESSEL.zustaendigFuer(f.Gesellschaft));

    // Für jeden Fall prüfen, ob er sich öffnen lässt. Das kostet eine
    // RSA-Entschlüsselung pro Fall (Millisekunden) und erspart dem Officer
    // die Überraschung, erst beim Klick zu merken, dass er nicht herankommt.
    for (const f of faelle) {
      f.__lesbar = SCHLUESSEL.istEntsperrt()
        ? !!(await SCHLUESSEL.fallOeffnen(f.SchluesselJson))
        : false;
    }
  }

  function gefiltert() {
    let liste = faelle.filter(f => !f.Geloescht);
    if (filter.status.length) liste = liste.filter(f => filter.status.includes(f.Status || "Neu"));
    if (filter.gesellschaften.length) {
      liste = liste.filter(f => filter.gesellschaften.includes(f.Gesellschaft));
    }
    if (filter.von) liste = liste.filter(f => new Date(f.Eingang) >= new Date(filter.von));
    if (filter.bis) {
      const bis = new Date(filter.bis);
      bis.setHours(23, 59, 59);
      liste = liste.filter(f => new Date(f.Eingang) <= bis);
    }
    if (filter.nurFristig) {
      liste = liste.filter(f => ["knapp", "ueberfaellig"].includes(fristLage(f)?.stufe));
    }
    liste.sort((a, b) => filter.aufsteigend
      ? new Date(a.Eingang) - new Date(b.Eingang)
      : new Date(b.Eingang) - new Date(a.Eingang));
    return liste;
  }

  function listeZeichnen() {
    const box = $("fallliste");
    box.innerHTML = "";
    const liste = gefiltert();

    $("gesperrtHinweis").hidden = SCHLUESSEL.istEntsperrt();
    $("uebersichtHinweis").textContent = SCHLUESSEL.istCCO()
      ? `Alle Fälle der Gruppe · ${liste.length} von ${faelle.length} angezeigt`
      : `Fälle Ihrer Zuständigkeit · ${liste.length} von ${faelle.length} angezeigt`;

    if (!liste.length) {
      const p = document.createElement("div");
      p.className = "karte";
      p.innerHTML = faelle.length
        ? "<p class='leise'>Kein Fall passt zu diesem Filter.</p>"
        : "<p class='leise'>Es liegen keine Fälle vor.</p>";
      box.appendChild(p);
      return;
    }

    for (const f of liste) {
      const karte = document.createElement("div");
      karte.className = "fall-karte";

      const kopf = document.createElement("div");
      kopf.className = "fall-kopf";
      const h = document.createElement("h3");
      h.textContent = f.Title;
      const st = document.createElement("span");
      st.className = "merkmal " + (
        f.Status === "Abgeschlossen" ? "m-zu" :
        f.Status === "Abgewiesen" ? "m-still" :
        f.Status === "Rückfrage" ? "m-frist" :
        f.Status === "Neu" ? "m-neu" : "m-offen");
      st.textContent = f.Status || "Neu";
      kopf.append(h, st);

      const lage = fristLage(f);
      if (lage && lage.stufe !== "ok") {
        const fr = document.createElement("span");
        fr.className = "merkmal " + (lage.stufe === "ueberfaellig" ? "m-frist" : "m-neu");
        fr.textContent = lage.text;
        kopf.appendChild(fr);
      }
      if (!f.__lesbar) {
        const zu = document.createElement("span");
        zu.className = "merkmal m-still";
        zu.title = "Für Ihren Schlüssel ist dieser Fall nicht freigegeben.";
        zu.textContent = "nicht lesbar";
        kopf.appendChild(zu);
      }
      karte.appendChild(kopf);

      const dl = document.createElement("dl");
      dl.style.margin = "10px 0 0";
      for (const [b, w] of [
        ["Eingegangen", datum(f.Eingang)],
        ["Es handelt sich um", f.Art || "–"],
        ["Thema", f.Thema || "–"],
        ["Betroffene Gesellschaft", f.Gesellschaft || "–"],
        ["Fallbearbeiter", f.Bearbeiter || "noch nicht zugewiesen"]
      ]) {
        const zeile = document.createElement("div");
        zeile.className = "fall-zeile";
        const dt = document.createElement("dt");
        dt.textContent = b;
        const dd = document.createElement("dd");
        dd.textContent = w;
        zeile.append(dt, dd);
        dl.appendChild(zeile);
      }
      karte.appendChild(dl);

      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "knopf knopf-haupt knopf-klein";
      knopf.style.marginTop = "12px";
      knopf.textContent = f.__lesbar ? "Details" : "Details (nur Stammdaten)";
      knopf.addEventListener("click", () => fallOeffnen(f));
      karte.appendChild(knopf);

      box.appendChild(karte);
    }
  }

  function filterZeichnen() {
    const st = $("filterStatus");
    st.innerHTML = "";
    for (const s of STATUS) {
      const l = document.createElement("label");
      const i = document.createElement("input");
      i.type = "checkbox"; i.value = s;
      i.checked = filter.status.includes(s);
      const sp = document.createElement("span");
      sp.textContent = s;
      l.append(i, sp);
      st.appendChild(l);
    }
    const ge = $("filterGesellschaft");
    ge.innerHTML = "";
    for (const g of gesellschaften) {
      const l = document.createElement("label");
      const i = document.createElement("input");
      i.type = "checkbox"; i.value = g;
      i.checked = filter.gesellschaften.includes(g);
      const sp = document.createElement("span");
      sp.textContent = g;
      l.append(i, sp);
      ge.appendChild(l);
    }
  }

  function filterUebernehmen() {
    filter.status = [...$("filterStatus").querySelectorAll("input:checked")].map(i => i.value);
    filter.gesellschaften =
      [...$("filterGesellschaft").querySelectorAll("input:checked")].map(i => i.value);
    filter.von = $("vonDatum").value;
    filter.bis = $("bisDatum").value;
    filter.nurFristig = $("nurFristig").checked;
    filter.aufsteigend = $("sortAuf").checked;
    listeZeichnen();
  }

  // ──────────────────────────────────────────────────────── Falldetail

  async function fallOeffnen(f) {
    const fallKey = SCHLUESSEL.istEntsperrt()
      ? await SCHLUESSEL.fallOeffnen(f.SchluesselJson) : null;

    let inhalt = null;
    if (fallKey) {
      try { inhalt = await KRYPTO.oeffnen(fallKey, f.Chiffre); }
      catch { toast("Der Fallinhalt ließ sich nicht entschlüsseln.", true); }
    }

    const alleNachrichten = await GRAPH.elemente(C.lists.nachrichten);
    const nachrichten = alleNachrichten
      .filter(n => n.Fallnummer === f.Title)
      .sort((a, b) => new Date(a.Gesendet) - new Date(b.Gesendet));
    for (const n of nachrichten) {
      if (!fallKey) continue;
      try { n.__text = (await KRYPTO.oeffnen(fallKey, n.Chiffre)).text; }
      catch { n.__text = null; }
    }

    const doku = await DOKU.lesen(f.Title);

    aktuell = { fall: f, inhalt, fallKey, nachrichten, doku };

    // Fehlende Zuständige nachträglich freischalten. Ohne das könnte eine
    // Vertretung einen laufenden Fall nie übernehmen.
    if (fallKey) {
      const drin = Object.keys(JSON.parse(f.SchluesselJson || "{}"));
      const fehlend = SCHLUESSEL.zustaendigeOfficer(f.Gesellschaft)
        .filter(b => !drin.includes(String(b.id)));
      if (fehlend.length) {
        const n = await SCHLUESSEL.freigeben(f, fallKey, fehlend);
        if (n) toast(`Fall für ${n} weitere zuständige Bearbeiter freigegeben `
          + `(in der Dokumentation vermerkt).`);
      }
    }

    detailZeichnen();
    zeige("fall");
  }

  function detailZeichnen() {
    const { fall: f, inhalt, nachrichten, doku } = aktuell;

    $("dFallNr").textContent = f.Title;
    const st = $("dStatus");
    st.textContent = f.Status || "Neu";
    st.className = "merkmal " + (
      f.Status === "Abgeschlossen" ? "m-zu" :
      f.Status === "Abgewiesen" ? "m-still" :
      f.Status === "Rückfrage" ? "m-frist" :
      f.Status === "Neu" ? "m-neu" : "m-offen");

    const lage = fristLage(f);
    $("dFrist").hidden = !lage;
    if (lage) {
      $("dFrist").textContent = lage.text;
      $("dFrist").className = "merkmal " + (
        lage.stufe === "ueberfaellig" ? "m-frist" :
        lage.stufe === "knapp" ? "m-neu" : "m-still");
    }

    // ── Falldaten
    const box = $("dInhalt");
    box.innerHTML = "";
    const dl = document.createElement("dl");
    dl.className = "falldaten";

    const stamm = [
      ["Eingegangen am", datum(f.Eingang)],
      ["Es handelt sich um", f.Art],
      ["Betroffene Gesellschaft", f.Gesellschaft],
      ["Rückfragen zugelassen", f.Rueckfragen === false ? "Nein" : "Ja"],
      ["Persönliches Treffen gewünscht", f.Treffen ? "Ja – bitte im Postfach vereinbaren" : "Nein"]
    ];
    for (const [b, w] of stamm) {
      const dt = document.createElement("dt");
      dt.textContent = b;
      const dd = document.createElement("dd");
      dd.textContent = w || "–";
      dl.append(dt, dd);
    }

    if (!inhalt) {
      const dt = document.createElement("dt");
      dt.textContent = "Inhalt der Meldung";
      const dd = document.createElement("dd");
      dd.className = "leer";
      dd.textContent = SCHLUESSEL.istEntsperrt()
        ? "Dieser Fall ist für Ihren Schlüssel nicht freigegeben. Ein zuständiger "
          + "Compliance Officer kann ihn für Sie freigeben."
        : "Ihr Schlüssel ist nicht entsperrt.";
      dl.append(dt, dd);
    } else {
      for (const [b, w] of [
        ["Was? (Sachverhalt)", inhalt.was],
        ["Wer ist davon betroffen?", inhalt.wer],
        ["Wann hat sich dies ereignet?", inhalt.wann],
        ["Wo?", inhalt.wo],
        ["Wie?", inhalt.wie],
        ["Beteiligter Lieferant", inhalt.lieferant],
        ["Objektive Anhaltspunkte", inhalt.belege]
      ]) {
        const dt = document.createElement("dt");
        dt.textContent = b;
        const dd = document.createElement("dd");
        if (w) dd.textContent = w;
        else { dd.className = "leer"; dd.textContent = "keine Angabe"; }
        dl.append(dt, dd);
      }
    }
    box.appendChild(dl);

    anhaengeZeichnen();
    kategorienZeichnen();
    nachrichtenZeichnen();
    fristenZeichnen();
    dokuZeichnen();
    abschlussZeichnen();

    $("nachrichtenZahl").textContent = nachrichten.length ? `(${nachrichten.length})` : "";
    document.querySelectorAll("#blick-fall .reiter button").forEach((b, i) =>
      b.classList.toggle("aktiv", i === 0));
    document.querySelectorAll("#blick-fall .blatt").forEach((b, i) =>
      b.classList.toggle("aktiv", i === 0));
    void doku;
  }

  function anhaengeZeichnen() {
    const { fall: f, inhalt, fallKey } = aktuell;
    const box = $("dAnhaenge");
    box.innerHTML = "";
    const liste = inhalt?.anhaenge || [];
    if (!liste.length) {
      box.innerHTML = "<p class='leise'>Keine Anhänge.</p>";
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "anhang-liste";
    liste.forEach((a, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = a.name;
      const gr = document.createElement("span");
      gr.className = "groesse";
      gr.textContent = (a.groesse / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "knopf knopf-zweit knopf-klein";
      knopf.textContent = "Herunterladen";
      knopf.addEventListener("click", async () => {
        knopf.disabled = true;
        try {
          const chiffre = await GRAPH.anlageLesen(f.Title, i + 1);
          const bytes = await KRYPTO.oeffnenBinaer(fallKey, chiffre);
          const url = URL.createObjectURL(new Blob([bytes],
            { type: a.typ || "application/octet-stream" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = a.name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          await DOKU.schreiben(f.Title, "Anhang geöffnet", a.name);
        } catch (e) {
          toast("Anhang nicht lesbar: " + e.message, true);
        } finally {
          knopf.disabled = false;
        }
      });
      li.append(name, gr, knopf);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function kategorienZeichnen() {
    const { fall: f } = aktuell;
    fuellen($("kThema"), themen, "– bitte wählen –");
    fuellen($("kBereich"), BEREICHE, "– bitte wählen –");
    fuellen($("kBedeutung"), BEDEUTUNGEN, "– bitte wählen –");

    const officer = SCHLUESSEL.zustaendigeOfficer(f.Gesellschaft);
    fuellen($("kBearbeiter"), officer.map(b => b.Title), "– nicht zugewiesen –");

    $("kThema").value = f.Thema || "";
    $("kBereich").value = f.Bereich || "";
    $("kBedeutung").value = f.Bedeutung || "";
    $("kBearbeiter").value = f.Bearbeiter || "";
  }

  async function kategorienSpeichern() {
    const { fall: f, fallKey } = aktuell;
    const knopf = $("btnKategorien");
    knopf.disabled = true;
    try {
      const neu = {
        Thema: $("kThema").value,
        Bereich: $("kBereich").value,
        Bedeutung: $("kBedeutung").value,
        Bearbeiter: $("kBearbeiter").value
      };
      // Status von „Neu" auf „In Bearbeitung" heben, sobald jemand
      // zuständig ist. Ein Fall, der bearbeitet wird, aber „Neu" heißt,
      // erzeugt nur falsche Erinnerungsmails.
      if (neu.Bearbeiter && (f.Status || "Neu") === "Neu") neu.Status = "In Bearbeitung";

      const geaendert = Object.entries(neu)
        .filter(([k, v]) => (f[k] || "") !== (v || ""))
        .map(([k, v]) => `${k}: ${f[k] || "–"} → ${v || "–"}`);
      if (!geaendert.length) { toast("Nichts geändert."); return; }

      await GRAPH.aendern(C.lists.faelle, f.id, neu);
      Object.assign(f, neu);

      // Zugewiesener Bearbeiter braucht den Schlüssel, sonst kann er den
      // Fall, den er bearbeiten soll, nicht öffnen.
      if (neu.Bearbeiter && fallKey) {
        const ziel = SCHLUESSEL.zustaendigeOfficer(f.Gesellschaft)
          .find(b => b.Title === neu.Bearbeiter);
        if (ziel) await SCHLUESSEL.freigeben(f, fallKey, [ziel]);
      }

      await DOKU.schreiben(f.Title, "Kategorien geändert", geaendert.join("; "));
      aktuell.doku = await DOKU.lesen(f.Title);
      dokuZeichnen();
      detailKopfAktualisieren();
      toast("Gespeichert.");
    } catch (e) {
      toast("Nicht gespeichert: " + e.message, true);
    } finally {
      knopf.disabled = false;
    }
  }

  function detailKopfAktualisieren() {
    const f = aktuell.fall;
    const st = $("dStatus");
    st.textContent = f.Status || "Neu";
    st.className = "merkmal " + (
      f.Status === "Abgeschlossen" ? "m-zu" :
      f.Status === "Abgewiesen" ? "m-still" :
      f.Status === "Rückfrage" ? "m-frist" :
      f.Status === "Neu" ? "m-neu" : "m-offen");
  }

  // ────────────────────────────────────────────────────── Nachrichten

  function nachrichtenZeichnen() {
    const { fall: f, nachrichten, fallKey } = aktuell;
    const box = $("dVerlauf");
    box.innerHTML = "";

    const darf = f.Rueckfragen !== false && !!fallKey;
    $("dAntwortbereich").hidden = !darf;
    $("dKeineRueckfragen").hidden = f.Rueckfragen !== false;

    $("dialogHinweis").textContent = f.Treffen
      ? "Der Hinweisgeber wünscht ein persönliches Treffen (§ 16 Abs. 3 HinSchG). "
        + "Schlagen Sie hier einen neutralen Ort und einen Zeitpunkt vor."
      : "Nachrichten werden mit dem Fallschlüssel verschlüsselt. Der Hinweisgeber "
        + "liest sie in seinem anonymen Postfach.";

    if (!nachrichten.length) {
      box.innerHTML = "<p class='leise'>Bisher keine Nachrichten.</p>";
      return;
    }
    for (const n of nachrichten) {
      const div = document.createElement("div");
      const vonUns = n.Richtung === "Meldestelle";
      div.className = "nachricht " + (vonUns ? "n-hinweisgeber" : "n-meldestelle");
      const kopf = document.createElement("div");
      kopf.className = "kopfzeile";
      kopf.textContent = (vonUns ? "Meldestelle" : "Hinweisgeber")
        + " · " + zeitpunkt(n.Gesendet);
      const p = document.createElement("p");
      p.textContent = n.__text ?? "[nicht entschlüsselbar – Fall nicht für Sie freigegeben]";
      div.append(kopf, p);
      box.appendChild(div);
    }
  }

  async function nachrichtSenden() {
    const { fall: f, fallKey } = aktuell;
    const text = $("dAntwort").value.trim();
    if (!text) return;
    const fehler = $("dSendeFehler");
    fehler.hidden = true;
    const knopf = $("btnDSenden");
    knopf.disabled = true;
    try {
      const chiffre = await KRYPTO.schliessen(fallKey, { text });
      await GRAPH.anlegen(C.lists.nachrichten, {
        Title: f.Title, Fallnummer: f.Title, Richtung: "Meldestelle",
        Chiffre: chiffre, Gesendet: new Date().toISOString()
      });
      aktuell.nachrichten.push({
        Richtung: "Meldestelle", Chiffre: chiffre,
        Gesendet: new Date().toISOString(), __text: text
      });
      $("dAntwort").value = "";

      // Der Fall geht auf „Rückfrage", damit in der Übersicht sichtbar ist,
      // dass jetzt der Hinweisgeber am Zug ist.
      if ((f.Status || "Neu") !== "Abgeschlossen" && f.Status !== "Abgewiesen") {
        await GRAPH.aendern(C.lists.faelle, f.id, { Status: "Rückfrage" });
        f.Status = "Rückfrage";
        detailKopfAktualisieren();
      }
      await DOKU.schreiben(f.Title, "Nachricht an Hinweisgeber gesendet",
        `${text.length} Zeichen (Inhalt verschlüsselt in der Nachrichtenliste)`);
      aktuell.doku = await DOKU.lesen(f.Title);
      nachrichtenZeichnen();
      dokuZeichnen();
      toast("Nachricht gesendet.");
    } catch (e) {
      fehler.textContent = e.message; fehler.hidden = false;
    } finally {
      knopf.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────── Fristen

  function fristenZeichnen() {
    const f = aktuell.fall;
    const t = $("fristenTabelle");
    const lage = fristLage(f);

    const zeilen = [
      ["Eingang der Meldung", datum(f.Eingang), "", ""],
      ["Eingangsbestätigung (§ 17 Abs. 1 Nr. 1)",
        datum(f.EingangsbestaetigungAm),
        `spätestens ${C.fristen.eingangsbestaetigungTage} Tage nach Eingang`,
        f.EingangsbestaetigungAm ? "erfüllt" : "OFFEN"],
      ["Rückmeldung (§ 17 Abs. 1 Nr. 6)",
        f.RueckmeldungAm ? datum(f.RueckmeldungAm) : "–",
        `fällig bis ${datum(f.RueckmeldungBis)}`,
        f.RueckmeldungAm ? "erfüllt"
          : lage?.stufe === "ueberfaellig" ? "ÜBERSCHRITTEN"
          : lage?.stufe === "knapp" ? "wird knapp" : "läuft"],
      ["Fallabschluss", datum(f.AbschlussAm), "", f.AbschlussAm ? "erfolgt" : "offen"],
      ["Löschung (§ 11 Abs. 5)", datum(f.LoeschenAm),
        `${C.fristen.aufbewahrungJahre} Jahre nach Abschluss`,
        f.LoeschenAm ? "vorgemerkt" : "beginnt mit dem Abschluss"],
      ["Eigene Wiedervorlage", datum(f.WiedervorlageAm),
        f.WiedervorlageGrund || "", ""]
    ];

    t.innerHTML = "<tr><th>Schritt</th><th>Datum</th><th>Vorgabe</th><th>Stand</th></tr>";
    for (const z of zeilen) {
      const tr = document.createElement("tr");
      z.forEach((wert, i) => {
        const td = document.createElement("td");
        td.textContent = wert;
        if (i === 3 && /ÜBERSCHRITTEN|OFFEN/.test(wert)) {
          td.style.color = "var(--rot)";
          td.style.fontWeight = "700";
        }
        tr.appendChild(td);
      });
      t.appendChild(tr);
    }

    $("wvDatum").value = f.WiedervorlageAm ? String(f.WiedervorlageAm).slice(0, 10) : "";
    $("wvGrund").value = f.WiedervorlageGrund || "";
  }

  async function wiedervorlageSetzen() {
    const f = aktuell.fall;
    try {
      const felder = {
        WiedervorlageAm: $("wvDatum").value ? new Date($("wvDatum").value).toISOString() : null,
        WiedervorlageGrund: $("wvGrund").value.trim()
      };
      await GRAPH.aendern(C.lists.faelle, f.id, felder);
      Object.assign(f, felder);
      await DOKU.schreiben(f.Title, "Wiedervorlage gesetzt",
        `${$("wvDatum").value || "entfernt"} – ${felder.WiedervorlageGrund}`);
      aktuell.doku = await DOKU.lesen(f.Title);
      fristenZeichnen();
      dokuZeichnen();
      toast("Wiedervorlage gespeichert.");
    } catch (e) {
      toast("Nicht gespeichert: " + e.message, true);
    }
  }

  // ────────────────────────────────────────────────────── Dokumentation

  function dokuZeichnen() {
    const t = $("dokuTabelle");
    t.innerHTML = "<tr><th>Zeitpunkt</th><th>Aktion</th><th>Bearbeiter</th>"
      + "<th>Einzelheiten</th></tr>";
    if (!aktuell.doku.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "leise";
      td.textContent = "Noch keine Einträge.";
      tr.appendChild(td);
      t.appendChild(tr);
      return;
    }
    for (const d of aktuell.doku) {
      const tr = document.createElement("tr");
      for (const w of [zeitpunkt(d.Zeitpunkt), d.Aktion, d.Akteur, d.Einzelheiten]) {
        const td = document.createElement("td");
        td.textContent = w || "";
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
  }

  async function vermerkSpeichern() {
    const text = $("vermerk").value.trim();
    if (!text) return;
    await DOKU.schreiben(aktuell.fall.Title, "Vermerk", text);
    $("vermerk").value = "";
    aktuell.doku = await DOKU.lesen(aktuell.fall.Title);
    dokuZeichnen();
    toast("Vermerk gespeichert.");
  }

  // ────────────────────────────────────────────────────── Fallabschluss

  function abschlussZeichnen() {
    const f = aktuell.fall;
    const zu = f.Status === "Abgeschlossen" || f.Status === "Abgewiesen";
    $("abschlussFormular").hidden = zu;
    $("abschlussVorhanden").hidden = !zu;
    if (zu) {
      $("abschlussVorhanden").innerHTML = "";
      const dl = document.createElement("dl");
      dl.className = "falldaten";
      for (const [b, w] of [
        ["Abgeschlossen am", datum(f.AbschlussAm)],
        ["Ergebnis", f.Ergebnis],
        ["Folgemaßnahme", f.Massnahme],
        ["Rückmeldung an den Hinweisgeber", f.RueckmeldungAm
          ? "erfolgt am " + datum(f.RueckmeldungAm)
          : "NICHT erfolgt"],
        ["Löschung vorgemerkt für", datum(f.LoeschenAm)]
      ]) {
        const dt = document.createElement("dt");
        dt.textContent = b;
        const dd = document.createElement("dd");
        dd.textContent = w || "–";
        if (w === "NICHT erfolgt") dd.style.color = "var(--rot)";
        dl.append(dt, dd);
      }
      $("abschlussVorhanden").appendChild(dl);
      return;
    }
    fuellen($("aErgebnis"), ERGEBNISSE, "– bitte wählen –");
    fuellen($("aMassnahmen"), MASSNAHMEN, "– bitte wählen –");
  }

  async function abschliessen(abweisen = false) {
    const { fall: f, fallKey } = aktuell;
    const fehler = $("abschlussFehler");
    fehler.hidden = true;

    const ergebnis = $("aErgebnis").value;
    const massnahme = $("aMassnahmen").value;
    const rueckmeldung = $("aRueckmeldung").value.trim();

    if (!ergebnis) {
      fehler.textContent = "Bitte wählen Sie ein Ergebnis.";
      fehler.hidden = false; return;
    }

    // Die Rückmeldung ist keine Höflichkeit, sondern § 17 Abs. 1 Nr. 6.
    // Sie zu überspringen geht nur, wenn der Hinweisgeber selbst keine
    // Rückfragen zugelassen hat – dann gibt es schlicht keinen Kanal.
    const kanalOffen = f.Rueckfragen !== false && !!fallKey;
    if (kanalOffen && !rueckmeldung) {
      fehler.textContent = "Bitte formulieren Sie die Rückmeldung an den Hinweisgeber. "
        + "Sie ist nach § 17 Abs. 1 Nr. 6 HinSchG verpflichtend, solange ein Kanal "
        + "zum Hinweisgeber besteht.";
      fehler.hidden = false; return;
    }

    const knopf = abweisen ? $("btnAbweisen") : $("btnAbschluss");
    knopf.disabled = true;
    try {
      const jetzt = new Date();
      const loeschen = new Date(jetzt);
      loeschen.setFullYear(loeschen.getFullYear() + C.fristen.aufbewahrungJahre);

      if (kanalOffen && rueckmeldung) {
        const chiffre = await KRYPTO.schliessen(fallKey, { text: rueckmeldung });
        await GRAPH.anlegen(C.lists.nachrichten, {
          Title: f.Title, Fallnummer: f.Title, Richtung: "Meldestelle",
          Chiffre: chiffre, Gesendet: jetzt.toISOString()
        });
        aktuell.nachrichten.push({
          Richtung: "Meldestelle", Chiffre: chiffre,
          Gesendet: jetzt.toISOString(), __text: rueckmeldung
        });
      }

      const felder = {
        Status: abweisen ? "Abgewiesen" : "Abgeschlossen",
        Ergebnis: ergebnis,
        Massnahme: massnahme,
        AbschlussAm: jetzt.toISOString(),
        LoeschenAm: loeschen.toISOString()
      };
      if (kanalOffen && rueckmeldung) felder.RueckmeldungAm = jetzt.toISOString();

      await GRAPH.aendern(C.lists.faelle, f.id, felder);
      Object.assign(f, felder);

      await DOKU.schreiben(f.Title, abweisen ? "Fall nicht weiterverfolgt" : "Fall abgeschlossen",
        `Ergebnis: ${ergebnis}. Folgemaßnahme: ${massnahme || "–"}. `
        + (kanalOffen && rueckmeldung
          ? "Rückmeldung nach § 17 Abs. 1 Nr. 6 HinSchG in das anonyme Postfach gestellt."
          : "Keine Rückmeldung möglich – der Hinweisgeber hat keine Rückfragen zugelassen.")
        + ` Löschung vorgemerkt für ${loeschen.toLocaleDateString("de-DE")}.`);

      aktuell.doku = await DOKU.lesen(f.Title);
      $("aRueckmeldung").value = "";
      detailKopfAktualisieren();
      abschlussZeichnen();
      fristenZeichnen();
      nachrichtenZeichnen();
      dokuZeichnen();
      toast(abweisen ? "Fall als nicht weiterverfolgt geschlossen."
                     : "Fall abgeschlossen und Rückmeldung gesendet.");
    } catch (e) {
      fehler.textContent = e.message; fehler.hidden = false;
    } finally {
      knopf.disabled = false;
    }
  }

  // ──────────────────────────────────────────────────────── Verwaltung

  function verwaltungZeichnen() {
    const t = $("bearbeiterTabelle");
    t.innerHTML = "<tr><th>E-Mail</th><th>Name</th><th>Rolle</th><th>Gesellschaften</th>"
      + "<th>Schlüssel</th><th>Aktiv</th><th></th></tr>";
    for (const b of SCHLUESSEL.alleBearbeiter()) {
      const tr = document.createElement("tr");
      for (const w of [b.Title, b.Anzeigename, b.Rolle, b.Gesellschaften,
                       b.PubKey ? "vorhanden" : "FEHLT", b.Aktiv === false ? "nein" : "ja"]) {
        const td = document.createElement("td");
        td.textContent = w || "–";
        if (w === "FEHLT") { td.style.color = "var(--rot)"; td.style.fontWeight = "700"; }
        tr.appendChild(td);
      }
      const td = document.createElement("td");
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "knopf knopf-still knopf-klein";
      knopf.textContent = b.Aktiv === false ? "Aktivieren" : "Deaktivieren";
      knopf.addEventListener("click", async () => {
        const neu = b.Aktiv === false;
        await GRAPH.aendern(C.lists.bearbeiter, b.id, { Aktiv: neu });
        b.Aktiv = neu;
        await DOKU.schreiben("", neu ? "Bearbeiter aktiviert" : "Bearbeiter deaktiviert", b.Title);
        verwaltungZeichnen();
        toast("Gespeichert.");
      });
      td.appendChild(knopf);
      tr.appendChild(td);
      t.appendChild(tr);
    }

    const box = $("nbGesellschaften");
    box.innerHTML = "";
    for (const g of gesellschaften) {
      const l = document.createElement("label");
      l.className = "haken";
      const i = document.createElement("input");
      i.type = "checkbox"; i.value = g;
      const s = document.createElement("span");
      s.textContent = g;
      l.append(i, s);
      box.appendChild(l);
    }
  }

  async function bearbeiterAnlegen() {
    const fehler = $("nbFehler");
    fehler.hidden = true;
    const mail = $("nbMail").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      fehler.textContent = "Bitte eine gültige E-Mail-Adresse eingeben.";
      fehler.hidden = false; return;
    }
    if (SCHLUESSEL.alleBearbeiter().some(b => (b.Title || "").toLowerCase() === mail)) {
      fehler.textContent = "Diese Adresse ist bereits eingetragen.";
      fehler.hidden = false; return;
    }
    const rolle = $("nbRolle").value;
    const gew = [...$("nbGesellschaften").querySelectorAll("input:checked")].map(i => i.value);
    const zustaendig = rolle === "Chief Compliance Officer" ? "*" : gew.join("; ");
    if (!zustaendig) {
      fehler.textContent = "Bitte mindestens eine Gesellschaft auswählen.";
      fehler.hidden = false; return;
    }
    try {
      await GRAPH.anlegen(C.lists.bearbeiter, {
        Title: mail,
        Anzeigename: $("nbName").value.trim() || mail,
        Rolle: rolle,
        Gesellschaften: zustaendig,
        Aktiv: true
      });
      await DOKU.schreiben("", "Bearbeiter aufgenommen", `${mail} (${rolle}, ${zustaendig})`);
      await SCHLUESSEL.laden();
      verwaltungZeichnen();
      $("nbMail").value = $("nbName").value = "";
      toast("Aufgenommen. Die Person muss sich nun anmelden und einen eigenen "
        + "Schlüssel anlegen, bevor sie Fälle lesen kann.");
    } catch (e) {
      fehler.textContent = e.message; fehler.hidden = false;
    }
  }

  // ─────────────────────────────────────────────────────────── Aufbau

  async function konfigurationLaden() {
    try {
      const zeilen = await GRAPH.elemente(C.lists.konfiguration);
      gesellschaften = zeilen.filter(z => z.Art === "Gesellschaft")
        .map(z => z.Title).filter(Boolean);
      themen = zeilen.filter(z => z.Art === "Thema").map(z => z.Title).filter(Boolean);
    } catch { /* Liste fehlt noch – dann die Vorgabewerte */ }
    if (!gesellschaften.length) gesellschaften = API_VORGABE.gesellschaften;
    if (!themen.length) themen = API_VORGABE.themen;
  }

  // Dieselben Vorgabewerte wie auf der Meldeseite. Sie stehen hier noch
  // einmal, weil bearbeitung.html js/api.js nicht lädt – die Bearbeitung
  // spricht ausschließlich Graph, nie den öffentlichen Endpunkt.
  const API_VORGABE = {
    gesellschaften: ["DIHAG Holding GmbH", "MEUSELWITZ GUSS Eisengießerei GmbH",
      "SHB Stahl- und Hartgusswerk Bösdorf GmbH", "EWA Eisenwerk Arnstadt GmbH",
      "DIHAG Zaigler GmbH", "DIHAG Eisenberg GmbH",
      "Weiß ich nicht / gesellschaftsübergreifend"],
    themen: ["Arbeitssicherheit", "Betrug, Unterschlagung", "Datenschutz",
      "Exportkontrolle, Embargo und Sanktionen", "Führungsverhalten",
      "Geldwäsche und Terrorismusfinanzierung", "Geschäftsgeheimnisse",
      "Geschenke und Einladungen", "Gesundheitsschutz", "Informationssicherheit",
      "Interessenkonflikte", "Kartellrecht, Wettbewerbsrecht", "Korruption",
      "Kundenrechte, Verbraucherschutz", "Mitarbeiterverhalten",
      "Diskriminierung, Mobbing", "Produktsicherheit", "Qualitätsmanagement",
      "Strafbares Verhalten von Beschäftigten", "Strafbares Verhalten von Lieferanten",
      "Umweltschutz", "Verstöße in der Lieferkette", "Sonstiges"]
  };

  async function starten() {
    if (!C.clientId) {
      $("ladetext").textContent =
        "In js/config.js ist keine clientId eingetragen. Bitte zuerst "
        + "setup-hinweis-app.ps1 ausführen.";
      return;
    }
    try {
      const konto = await GRAPH.anmelden();
      if (!konto) return;             // Weiterleitung zur Anmeldung läuft

      $("ladetext").textContent = "Berechtigung wird geprüft …";
      await SCHLUESSEL.laden();

      if (!SCHLUESSEL.darfRein()) {
        $("laden").hidden = true;
        $("keinZugriff").hidden = false;
        $("keinZugriffText").textContent =
          `Das Konto ${SCHLUESSEL.ich.email} ist nicht als Bearbeiter der Meldestelle `
          + `eingetragen${SCHLUESSEL.ich.eintrag ? ", der Eintrag ist deaktiviert" : ""}.`;
        return;
      }

      await konfigurationLaden();
      $("laden").hidden = true;
      $("hauptnav").hidden = false;
      $("werBinIch").textContent = `${SCHLUESSEL.ich.name} · `
        + (SCHLUESSEL.ich.rolle || "Administrator");
      $("navVerwaltung").hidden = !SCHLUESSEL.darfVerwalten();

      filterZeichnen();

      // Ohne Schlüssel führt kein Weg an der Schlüsselseite vorbei – alles
      // andere wäre eine Übersicht voller „nicht lesbar".
      if (!SCHLUESSEL.hatSchluessel() && !SCHLUESSEL.ich.hauptAdmin) {
        await schluesselZeichnen();
        zeige("schluessel");
        return;
      }
      if (SCHLUESSEL.hatSchluessel() && !SCHLUESSEL.istEntsperrt()) {
        await schluesselZeichnen();
        zeige("schluessel");
        await fallListeLaden();       // Stammdaten schon einmal holen
        return;
      }

      await fallListeLaden();
      listeZeichnen();
      zeige("uebersicht");

    } catch (e) {
      $("ladetext").textContent = "Fehler beim Start: " + (e.message || e);
      console.error(e);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("btnAbmelden").addEventListener("click", () => GRAPH.abmelden());
    $("btnAbmelden2").addEventListener("click", () => GRAPH.abmelden());

    $("btnPaarAnlegen").addEventListener("click", paarAnlegen);
    $("btnEntsperren").addEventListener("click", entsperren);
    $("ppEin").addEventListener("keydown", e => { if (e.key === "Enter") entsperren(); });
    $("btnNotfallDrucken").addEventListener("click", () => window.print());
    $("btnNotfallFertig").addEventListener("click", async () => {
      $("kastenNotfall").hidden = true;
      await schluesselZeichnen();
      await fallListeLaden();
      listeZeichnen();
      zeige("uebersicht");
    });
    $("btnPpWechseln").addEventListener("click", async () => {
      const f = $("wechselFehler");
      f.hidden = true;
      if ($("ppWechsel").value.length < 12) {
        f.textContent = "Die neue Passphrase muss mindestens 12 Zeichen haben.";
        f.hidden = false; return;
      }
      try {
        await SCHLUESSEL.passphraseAendern($("ppAlt").value, $("ppWechsel").value);
        $("ppAlt").value = $("ppWechsel").value = "";
        toast("Passphrase geändert.");
      } catch (e) { f.textContent = e.message; f.hidden = false; }
    });

    $("btnFilter").addEventListener("click", filterUebernehmen);
    $("btnFilterWeg").addEventListener("click", () => {
      filter = { status: [...OFFEN], gesellschaften: [], von: "", bis: "",
                 nurFristig: false, aufsteigend: false };
      $("vonDatum").value = $("bisDatum").value = "";
      $("nurFristig").checked = $("sortAuf").checked = false;
      filterZeichnen();
      listeZeichnen();
    });
    $("btnStatistik").addEventListener("click", () => {
      const n = EXPORT.statistik(gefiltert());
      toast(`${n} Fälle exportiert.`);
    });

    document.querySelectorAll("#blick-fall .reiter button").forEach(b =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#blick-fall .reiter button")
          .forEach(x => x.classList.toggle("aktiv", x === b));
        document.querySelectorAll("#blick-fall .blatt")
          .forEach(x => x.classList.toggle("aktiv", x.dataset.blatt === b.dataset.blatt));
      }));

    $("btnKategorien").addEventListener("click", kategorienSpeichern);
    $("btnDSenden").addEventListener("click", nachrichtSenden);
    $("btnWv").addEventListener("click", wiedervorlageSetzen);
    $("btnVermerk").addEventListener("click", vermerkSpeichern);
    $("btnAbschluss").addEventListener("click", () => abschliessen(false));
    $("btnAbweisen").addEventListener("click", () => abschliessen(true));
    $("btnBearbeiterAnlegen").addEventListener("click", bearbeiterAnlegen);

    $("btnWord").addEventListener("click", () => {
      EXPORT.alsWord(aktuell.fall, aktuell.inhalt, aktuell.nachrichten, aktuell.doku);
      DOKU.schreiben(aktuell.fall.Title, "Fallakte als Word exportiert", "");
    });
    $("btnPdf").addEventListener("click", () => {
      EXPORT.alsPdf(aktuell.fall, aktuell.inhalt, aktuell.nachrichten, aktuell.doku);
      DOKU.schreiben(aktuell.fall.Title, "Fallakte als PDF exportiert", "");
    });

    starten();
  });
})();
