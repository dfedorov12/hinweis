"use strict";

/* Die Meldeseite
   ══════════════

   Ablauf einer Meldung, von hier aus gesehen:

     1. Startdaten holen  – Auswahllisten und die öffentlichen Schlüssel der
                            Compliance Officer. Ohne Schlüssel kein Formular.
     2. Ausfüllen         – nichts verlässt dabei das Gerät.
     3. Absenden          – Fallnummer und Zugangscode werden HIER erzeugt,
                            der Inhalt wird HIER verschlüsselt, und erst das
                            Ergebnis geht zum Flow.
     4. Zettel anzeigen   – Fallnummer und Code, einmalig.

   Der wichtigste Satz dieser Datei steht in `absenden`: Der Zugangscode
   wird erzeugt, benutzt und danach nirgendwo hingeschrieben – nicht in
   localStorage, nicht in die URL, nicht in ein Formularfeld. Er lebt in
   einer lokalen Variablen und auf dem Bildschirm des Hinweisgebers.       */

(() => {

  const C = HINWEIS_CONFIG;
  const $ = id => document.getElementById(id);

  let start = null;          // Startdaten vom Flow
  let anhaenge = [];         // { name, typ, bytes }
  let beginn = Date.now();   // für die Mindestdauer
  let laeuft = false;

  // ────────────────────────────────────────────────────────── Werkzeug

  function toast(text, fehler = false) {
    const t = $("toast");
    t.textContent = text;
    t.classList.toggle("fehler", fehler);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, fehler ? 9000 : 4000);
  }

  // Dezimaltrennzeichen nach Sprache: „3,0 MB" im Deutschen, „3.0 MB" im
  // Englischen. Kleinigkeit, aber ein deutsches Komma mitten in einem
  // englischen Satz lässt eine Seite unfertig wirken – und wer sich fragt,
  // ob die Übersetzung fertig ist, fragt sich auch, ob die Zusage der
  // Anonymität es ist.
  const mb = b => (b / 1024 / 1024).toFixed(1)
    .replace(".", I18N.aktuell() === "en" ? "." : ",");

  function fuellen(select, werte, platzhalter = true) {
    select.innerHTML = "";
    if (platzhalter) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = I18N.t("waehlen");
      select.appendChild(o);
    }
    for (const w of werte) {
      const o = document.createElement("option");
      // Gespeichert wird immer der deutsche Wert, angezeigt der übersetzte.
      // Sonst stünden in der Fallliste zwei Sprachen nebeneinander und jede
      // Auswertung nach Thema wäre wertlos.
      o.value = w;
      o.textContent = I18N.bezeichnung(w);
      select.appendChild(o);
    }
  }

  function fehlerZeigen(feld, text) {
    const p = document.querySelector(`[data-fehler="${feld}"]`);
    const el = $(feld);
    if (p) { p.textContent = text || ""; p.hidden = !text; }
    if (el) {
      if (text) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    }
  }

  // ──────────────────────────────────────────────────────────── Anhänge

  function anhangHilfeSetzen() {
    $("anhang-hilfe").textContent = I18N.t("feld.anhaenge.hilfe", {
      max: C.maxAnhaenge,
      mb: mb(C.maxAnhangBytes)
    });
  }

  function anhaengeZeichnen() {
    const ul = $("anhangliste");
    ul.innerHTML = "";
    anhaenge.forEach((a, i) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = a.name;

      const groesse = document.createElement("span");
      groesse.className = "groesse";
      groesse.textContent = mb(a.bytes.byteLength) + " MB";

      const weg = document.createElement("button");
      weg.type = "button";
      weg.className = "knopf knopf-still knopf-klein";
      weg.textContent = I18N.t("anhang.entfernen");
      weg.addEventListener("click", () => {
        anhaenge.splice(i, 1);
        anhaengeZeichnen();
      });

      li.append(name, groesse, weg);
      ul.appendChild(li);
    });
  }

  async function dateienAufnehmen(dateiListe) {
    fehlerZeigen("dateien", "");
    for (const datei of dateiListe) {
      if (anhaenge.length >= C.maxAnhaenge) {
        fehlerZeigen("dateien", I18N.t("anhang.zuviele", { max: C.maxAnhaenge }));
        break;
      }
      if (datei.size > C.maxAnhangBytes) {
        fehlerZeigen("dateien", I18N.t("anhang.zugross", {
          name: datei.name, mb: mb(datei.size), max: mb(C.maxAnhangBytes)
        }));
        continue;
      }
      const bytes = new Uint8Array(await datei.arrayBuffer());
      anhaenge.push({
        name: bereinigterName(datei.name),
        typ: datei.type || "application/octet-stream",
        bytes
      });
    }
    $("dateien").value = "";
    anhaengeZeichnen();
  }

  /** Dateinamen entschärfen.
   *  Zwei Gründe: Erstens landet der Name als Dateiname in SharePoint, und
   *  Pfadtrenner oder Steuerzeichen haben dort nichts verloren. Zweitens
   *  verrät ein Name wie „Schmidt_Notizen_Nachtschicht.docx“ mehr, als dem
   *  Hinweisgeber in dem Moment bewusst ist – deshalb wird der Name in der
   *  Liste sichtbar angezeigt, bevor abgesendet wird.                      */
  function bereinigterName(name) {
    // Bewusst Zeichen fuer Zeichen statt per Zeichenklasse: In einer
    // Zeichenklasse muessten die Steuerzeichen als Bereich stehen, und ein
    // Bereich aus Escape-Sequenzen ist genau die Stelle, an der beim
    // Bearbeiten unbemerkt ein rohes Steuerzeichen im Quelltext landet.
    // Der Backslash kommt über seinen Zeichencode herein statt als "\\":
    // Eine escapte Sequenz an dieser Stelle ist erfahrungsgemäß die erste,
    // die bei einer späteren Bearbeitung zusammenschrumpft – und dann fehlt
    // ausgerechnet der Pfadtrenner in der Verbotsliste, ohne dass etwas bricht.
    const verboten = String.fromCharCode(92) + '/:*?"<>|#%{}~';
    let sauber = "";
    for (const z of String(name)) {
      const k = z.codePointAt(0);
      sauber += (k < 32 || k === 127 || verboten.includes(z)) ? "_" : z;
    }
    // Nur der FÜHRENDE Punkt stört (versteckte Datei, „.htaccess"); weitere
    // Punkte danach sind harmlos. Eine Schleife wäre hier irreführend – nach
    // dem ersten Durchgang beginnt der Name ohnehin mit einem Unterstrich.
    if (sauber.startsWith(".")) sauber = "_" + sauber.slice(1);
    return sauber.slice(0, 120) || "anhang";
  }

  // ────────────────────────────────────────────────────────── Schieber

  function schieberPruefen() {
    const s = $("schieber");
    const frei = Number(s.value) >= 100;
    const stand = $("schieberstand");
    stand.textContent = I18N.t(frei ? "schieber.auf" : "schieber.zu");
    stand.classList.toggle("frei", frei);
    return frei;
  }

  // ──────────────────────────────────────────────────────── Zuständigkeit

  /** Für wen der Fall verschlüsselt wird.
   *
   *  Das ist die Zugriffskontrolle dieser Anwendung – nicht die Oberfläche
   *  und nicht die SharePoint-Berechtigung. Wer hier nicht dabei ist, kann
   *  den Fall später nicht öffnen, auch nicht mit Vollzugriff auf die Liste.
   *
   *  Zuständig ist, wer die gewählte Gesellschaft betreut, plus alle mit
   *  „*“ (Chief Compliance Officer). Das „*“ ist nicht bequem, sondern
   *  notwendig: Bliebe ein Fall allein bei einem lokalen Officer und dieser
   *  fiele aus, wäre die Akte weg. Und wenn sich die Meldung gerade gegen
   *  den lokalen Officer richtet, muss ohnehin jemand darüber stehen.      */
  function zustaendige(gesellschaft) {
    const passt = b => (b.gesellschaften || []).some(g =>
      g === "*" || g === gesellschaft);
    const treffer = start.bearbeiter.filter(passt);
    // Keine Zuständigkeit gefunden? Dann an alle, die es gibt – lieber ein
    // Officer zu viel als eine Meldung, die niemand öffnen kann.
    return treffer.length ? treffer : start.bearbeiter;
  }

  // ────────────────────────────────────────────────────────── Absenden

  async function absenden(ereignis) {
    ereignis.preventDefault();
    if (laeuft) return;

    const sammel = $("sammelfehler");
    sammel.hidden = true;
    ["thema", "gesellschaft", "was"].forEach(f => fehlerZeigen(f, ""));

    // Pflichtfelder
    let fehlt = false;
    for (const f of ["thema", "gesellschaft", "was"]) {
      if (!$(f).value.trim()) { fehlerZeigen(f, I18N.t("fehler.pflicht")); fehlt = true; }
    }
    if (fehlt) {
      sammel.textContent = I18N.t("fehler.pflichtfelder", { stern: "*" });
      sammel.hidden = false;
      document.querySelector('[aria-invalid="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!schieberPruefen()) {
      sammel.textContent = I18N.t("fehler.schieber");
      sammel.hidden = false;
      $("schieber").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Honigtopf und Mindestdauer. Beide sind bewusst kein hartes Nein für
    // Menschen: Der Honigtopf ist unsichtbar, wer ihn ausfüllt, ist keiner;
    // die Mindestdauer meldet sich mit einer Bitte, nicht mit einer Sperre.
    const dauerSek = Math.round((Date.now() - beginn) / 1000);
    if ($("webseite").value) {
      // Stillschweigend so tun, als sei alles gut. Einem Automaten zu sagen,
      // woran er gescheitert ist, hilft nur ihm.
      zeigeBestaetigung(KRYPTO.fallnummer(), KRYPTO.zugangscode(), false);
      return;
    }
    if (dauerSek < C.mindestDauerSek) {
      sammel.textContent = I18N.t("fehler.zuschnell");
      sammel.hidden = false;
      beginn = Date.now() - C.mindestDauerSek * 1000;   // beim zweiten Versuch durchlassen
      return;
    }

    laeuft = true;
    const knopf = $("absenden");
    knopf.disabled = true;
    knopf.textContent = I18N.t("absenden.laeuft");

    try {
      const fall = KRYPTO.fallnummer();
      const code = KRYPTO.zugangscode();

      // ── Inhalt zusammenstellen. ALLES, was der Hinweisgeber geschrieben
      //    hat, kommt hier hinein und damit in die Chiffre. Was außerhalb
      //    bleibt, steht im Klartext in SharePoint – deshalb ist die Liste
      //    unten so kurz wie irgend möglich.
      const inhalt = {
        was: $("was").value.trim(),
        wer: $("wer").value.trim(),
        wann: $("wann").value.trim(),
        wo: $("wo").value.trim(),
        wie: $("wie").value.trim(),
        lieferant: $("lieferant").value.trim(),
        belege: $("belege").value.trim(),
        sprache: I18N.aktuell(),
        anhaenge: anhaenge.map(a => ({ name: a.name, typ: a.typ, groesse: a.bytes.byteLength }))
      };

      const fallKey = await KRYPTO.fallSchluessel();
      const chiffre = await KRYPTO.schliessen(fallKey, inhalt);

      // Ein SharePoint-Mehrzeilenfeld fasst 63 999 Zeichen. Die Feldlängen im
      // Formular sind so bemessen, dass die Chiffre auch im ungünstigsten
      // Fall darunter bleibt – aber verlassen sollte man sich darauf nicht:
      // Würde die Meldung serverseitig abgeschnitten, wäre sie nicht mehr
      // entschlüsselbar, und der Hinweisgeber erführe davon nie etwas.
      // Lieber hier ehrlich abbrechen als dort still verstümmeln.
      if (chiffre.length > 60000) {
        throw new Error("Die Meldung ist zu umfangreich, um sicher gespeichert zu "
          + "werden. Bitte kürzen Sie den Text oder hängen Sie die Einzelheiten "
          + "als Datei an.");
      }

      // ── Fallschlüssel verpacken: einmal für den Hinweisgeber (Code),
      //    einmal je zuständigem Compliance Officer.
      const schluessel = { hg: await KRYPTO.fuerCodeVerpacken(fallKey, code, fall) };
      for (const b of zustaendige($("gesellschaft").value)) {
        schluessel[b.id] = await KRYPTO.fuerBearbeiterVerpacken(fallKey, b.pub);
      }

      // ── Anhänge einzeln verschlüsseln
      const anhangPakete = [];
      for (let i = 0; i < anhaenge.length; i++) {
        anhangPakete.push({
          // Der Dateiname steht NICHT im Klartext in SharePoint – er steckt
          // im verschlüsselten Inhalt. In der Bibliothek liegt nur eine
          // durchnummerierte Datei. Ein Name wie „Protokoll_Abteilung_3.pdf“
          // wäre sonst eine Spur, die an der Verschlüsselung vorbeiführt.
          nr: i + 1,
          daten: await KRYPTO.schliessenBinaer(fallKey, anhaenge[i].bytes)
        });
      }

      const antwort = await API.melden({
        fall,
        kennung: await KRYPTO.codeKennung(code, fall),
        // Klartext-Merkmale. Jedes einzelne ist eine bewusste Entscheidung:
        // ohne sie ließe sich weder die Zuständigkeit bestimmen noch eine
        // Frist überwachen noch eine Statistik führen. Keines davon zeigt
        // auf eine Person.
        art: document.querySelector('input[name="art"]:checked').value,
        thema: $("thema").value,
        gesellschaft: $("gesellschaft").value,
        rueckfragen: $("rueckfragen").checked,
        treffen: $("treffen").checked,
        bearbeiterIds: Object.keys(schluessel).filter(k => k !== "hg"),
        chiffre,
        schluessel: JSON.stringify(schluessel),
        anhaenge: anhangPakete,
        meta: { dauerSek, sprache: I18N.aktuell() }
      });

      zeigeBestaetigung(fall, code, antwort.probelauf);

    } catch (e) {
      $("sammelfehler").textContent = I18N.t("fehler.senden", { grund: e.message || e });
      $("sammelfehler").hidden = false;
      toast(e.message || String(e), true);
      knopf.disabled = false;
      knopf.textContent = I18N.t("absenden");
      laeuft = false;
    }
  }

  // ────────────────────────────────────────────────────── Bestätigung

  function zeigeBestaetigung(fall, code, probelauf) {
    $("formularbereich").hidden = true;
    $("bestaetigung").hidden = false;
    $("probelaufdanke").hidden = !probelauf;
    $("codeanzeige").textContent = code;
    $("fallanzeige").textContent = fall;
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Ab hier gibt es kein Zurück zum Formular: Die eingegebenen Texte
    // werden aus dem Speicher genommen, damit nach dem Absenden auch ein
    // „Zurück“ im Browser nichts mehr hergibt.
    anhaenge = [];
    $("meldung").reset();

    $("btnKopieren").onclick = async () => {
      try {
        await navigator.clipboard.writeText(`${fall} / ${code}`);
        toast(I18N.t("danke.kopiert"));
      } catch {
        // Zwischenablage verweigert (kein HTTPS, alter Browser) – dann
        // wenigstens markieren, damit von Hand kopiert werden kann.
        const r = document.createRange();
        r.selectNodeContents($("codeanzeige"));
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    };

    $("btnDrucken").onclick = () => window.print();

    $("btnDatei").onclick = () => {
      const text =
        `DIHAG Hinweisgebersystem\r\n` +
        `========================\r\n\r\n` +
        `Fallnummer:   ${fall}\r\n` +
        `Zugangscode:  ${code}\r\n\r\n` +
        `Postfach:     ${C.adresse}postfach.html\r\n\r\n` +
        `Bewahren Sie diese Datei sicher auf - am besten nicht auf einem\r\n` +
        `Firmengeraet. Der Zugangscode ist nirgends gespeichert und kann\r\n` +
        `nicht wiederhergestellt werden.\r\n`;
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Hinweis_${fall}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  // ─────────────────────────────────────────────────────────── Aufbau

  async function aufbauen() {
    I18N.start();
    $("externerLink").href = C.externeMeldestelle.url;

    try {
      start = await API.start();
    } catch (e) {
      $("laden").hidden = true;
      const box = $("startfehler");
      box.textContent = I18N.t("fehler.start", { grund: e.message || String(e) });
      const a = document.createElement("a");
      a.href = C.externeMeldestelle.url;
      a.rel = "noreferrer noopener";
      a.target = "_blank";
      a.textContent = " " + C.externeMeldestelle.name;
      box.appendChild(a);
      box.hidden = false;
      return;
    }

    fuellen($("thema"), start.themen);
    fuellen($("gesellschaft"), start.gesellschaften);
    anhangHilfeSetzen();

    $("laden").hidden = true;
    $("formularbereich").hidden = false;
    $("probelaufhinweis").hidden = !start.probelauf;
    beginn = Date.now();

    $("schieber").addEventListener("input", schieberPruefen);
    $("dateien").addEventListener("change", e => dateienAufnehmen(e.target.files));
    $("meldung").addEventListener("submit", absenden);

    // Beim Sprachwechsel müssen die Auswahllisten neu beschriftet werden –
    // die Werte bleiben deutsch, nur die Anzeige wechselt.
    document.addEventListener("sprachwechsel", () => {
      const t = $("thema").value, g = $("gesellschaft").value;
      fuellen($("thema"), start.themen);
      fuellen($("gesellschaft"), start.gesellschaften);
      $("thema").value = t;
      $("gesellschaft").value = g;
      anhangHilfeSetzen();
      anhaengeZeichnen();
      schieberPruefen();
      if (!$("absenden").disabled) $("absenden").textContent = I18N.t("absenden");
    });

    // Warnen, wenn mitten im Ausfüllen weggeklickt wird. Ein verlorener
    // Sachverhalt wird selten ein zweites Mal geschrieben.
    window.addEventListener("beforeunload", e => {
      if (laeuft || $("bestaetigung").hidden === false) return;
      if ($("was").value.trim()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  document.addEventListener("DOMContentLoaded", aufbauen);
})();
