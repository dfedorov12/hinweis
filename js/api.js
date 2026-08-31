"use strict";

/* Annahmestelle für anonyme Meldungen
   ═══════════════════════════════════

   Der einzige Weg der öffentlichen Seiten nach draußen. Sie sprechen
   ausschließlich den Power-Automate-Flow an, niemals Microsoft Graph –
   genau darin liegt die Anonymität: Der Flow schreibt mit SEINER Verbindung
   nach SharePoint, der Hinweisgeber meldet sich nirgends an und hinterlässt
   deshalb auch kein „Erstellt von".

   Was der Flow zu sehen bekommt, ist bereits Chiffre. Er ist Briefkasten,
   nicht Mitleser – auch wer den Ausführungsverlauf des Flows öffnet, findet
   dort keinen Sachverhalt, sondern Base64.

   Zwei Feinheiten, die beim Nachbauen Ärger machen:

   1. Inhaltstyp „text/plain". Damit gilt die Anfrage als „einfach" im Sinne
      von CORS und der Browser schickt KEINE OPTIONS-Vorabanfrage. Der
      Power-Automate-Trigger beantwortet OPTIONS nämlich nicht brauchbar.
      Der Rumpf ist trotzdem JSON – der Flow liest ihn mit json(triggerBody()).
   2. Die Antwort des Flows muss den Kopf „Access-Control-Allow-Origin"
      tragen, sonst darf der Browser sie nicht lesen.

   Fehlt der Endpunkt in js/config.js, läuft alles im Probelauf: Das Formular
   arbeitet vollständig samt Verschlüsselung, gespeichert wird nichts.       */

const API = (() => {

  const C = () => HINWEIS_CONFIG;

  const scharf = () => !!(C().endpunkt || "").trim();

  /** Alles jenseits von ASCII maskiert weiterreichen.
   *
   *  Power Automate liest den Rumpf einer „text/plain"-Anfrage nicht
   *  zuverlässig als UTF-8 – in der Schwesteranwendung kam „Gießerei" als
   *  „Gie?erei" in SharePoint an, obwohl der Browser korrekte UTF-8-Bytes
   *  samt charset schickte. Bei einer Meldung, in der es auf den genauen
   *  Wortlaut ankommt, wäre das nicht bloß unschön: Ein verstümmelter
   *  Sachverhalt taugt als Grundlage einer Untersuchung nichts.
   *
   *  Nach dieser Maskierung stehen auf der Leitung nur ASCII-Zeichen; die
   *  Umlaute entstehen erst beim JSON-Parsen im Flow. Gültiges JSON bleibt
   *  es – solche Escapes sind im Standard ausdrücklich vorgesehen.
   *
   *  Für die Chiffre selbst spielt das keine Rolle (Base64 ist ASCII), aber
   *  Auswahlwerte wie „Gießerei" gehen im Klartext mit.                     */
  function nurAscii(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      // Über Code-Einheiten laufen, nicht über Code-Punkte: Ein Emoji
      // besteht aus zwei Surrogaten, die einzeln maskiert werden und die
      // JSON.parse im Flow wieder zusammensetzt. Array.from würde die
      // zweite Hälfte verschlucken – dann stünde ein kaputtes Zeichen in
      // der Akte.
      out += c > 127 ? "\\u" + c.toString(16).padStart(4, "0") : s[i];
    }
    return out;
  }

  async function ruf(nutzlast, timeoutMs = 60000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(C().endpunkt, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: nurAscii(JSON.stringify(nutzlast)),
        signal: ctrl.signal,
        // Kein Referrer, keine Cookies, kein Zwischenspeicher. Der Flow
        // braucht nichts davon, und was nicht mitgeschickt wird, kann auch
        // nicht protokolliert werden. Bei einem Hinweisgebersystem ist das
        // kein Detail, sondern der Unterschied zwischen anonym und fast
        // anonym.
        referrerPolicy: "no-referrer",
        credentials: "omit",
        cache: "no-store"
      });
      const roh = await r.text();
      let d = null;
      try { d = roh ? JSON.parse(roh) : null; } catch { /* kein JSON */ }
      if (!r.ok) {
        const e = new Error(d?.fehler || d?.message || roh || `HTTP ${r.status}`);
        e.status = r.status;
        throw e;
      }
      return d ?? {};
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error("Die Verbindung hat zu lange gedauert. Bitte prüfen Sie "
          + "Ihre Internetverbindung und versuchen Sie es erneut.");
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /* Rückfallwerte für den Probelauf und für den Fall, dass die Liste
     `Hinweis_Konfiguration` noch leer ist. Maßgeblich ist immer die Liste. */

  const PROBE_GESELLSCHAFTEN = [
    "DIHAG Holding GmbH",
    "MEUSELWITZ GUSS Eisengießerei GmbH",
    "SHB Stahl- und Hartgusswerk Bösdorf GmbH",
    "EWA Eisenwerk Arnstadt GmbH",
    "DIHAG Zaigler GmbH",
    "DIHAG Eisenberg GmbH",
    "Weiß ich nicht / gesellschaftsübergreifend"
  ];

  const PROBE_THEMEN = [
    "Arbeitssicherheit",
    "Betrug, Unterschlagung",
    "Datenschutz",
    "Exportkontrolle, Embargo und Sanktionen",
    "Führungsverhalten",
    "Geldwäsche und Terrorismusfinanzierung",
    "Geschäftsgeheimnisse",
    "Geschenke und Einladungen",
    "Gesundheitsschutz",
    "Informationssicherheit",
    "Interessenkonflikte",
    "Kartellrecht, Wettbewerbsrecht",
    "Korruption",
    "Kundenrechte, Verbraucherschutz",
    "Mitarbeiterverhalten",
    "Diskriminierung, Mobbing",
    "Produktsicherheit",
    "Qualitätsmanagement",
    "Strafbares Verhalten von Beschäftigten",
    "Strafbares Verhalten von Lieferanten",
    "Umweltschutz",
    "Verstöße in der Lieferkette",
    "Sonstiges"
  ];

  /** Startdaten: Auswahllisten und die öffentlichen Schlüssel der Compliance
   *  Officer. Ohne diese Schlüssel kann nicht verschlüsselt werden – die
   *  Meldeseite ist deshalb erst benutzbar, wenn der Flow geantwortet hat.
   *  Das ist Absicht: Eine Meldung im Klartext entgegenzunehmen, „weil der
   *  Server gerade nicht erreichbar ist", wäre genau der Fehler, den diese
   *  Anwendung vermeiden soll.
   *
   *  Zurück kommen bewusst KEINE Namen und keine E-Mail-Adressen der
   *  Officer, nur Kennung, Zuständigkeit und öffentlicher Schlüssel. Der
   *  Endpunkt ist öffentlich; er soll nicht verraten, wer die Meldungen
   *  liest.                                                                 */
  async function start() {
    if (!scharf()) {
      // Probelauf mit einem Wegwerf-Schlüsselpaar. So lässt sich das
      // Formular samt Verschlüsselung vollständig durchspielen, bevor der
      // Flow steht – nur entschlüsseln kann das Ergebnis dann niemand mehr.
      const paar = await crypto.subtle.generateKey({
        name: "RSA-OAEP", modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
      }, true, ["encrypt", "decrypt"]);
      return {
        probelauf: true,
        gesellschaften: PROBE_GESELLSCHAFTEN,
        themen: PROBE_THEMEN,
        bearbeiter: [{
          id: "probelauf",
          gesellschaften: ["*"],
          pub: KRYPTO.b64(await crypto.subtle.exportKey("spki", paar.publicKey))
        }]
      };
    }
    const d = await ruf({ aktion: "start" });
    if (d.ok === false) throw new Error(d.fehler || "Startdaten nicht erhalten.");
    if (!Array.isArray(d.bearbeiter) || d.bearbeiter.length === 0) {
      throw new Error("Es ist derzeit kein Compliance Officer mit einem Schlüssel "
        + "hinterlegt. Ohne Schlüssel kann Ihre Meldung nicht verschlüsselt werden. "
        + "Bitte versuchen Sie es später erneut oder wenden Sie sich an die externe "
        + "Meldestelle.");
    }
    return {
      probelauf: false,
      gesellschaften: d.gesellschaften?.length ? d.gesellschaften : PROBE_GESELLSCHAFTEN,
      themen:         d.themen?.length         ? d.themen         : PROBE_THEMEN,
      bearbeiter:     d.bearbeiter
    };
  }

  /** Meldung einreichen. `nutzlast` enthält nur Chiffre und die wenigen
   *  Merkmale, die zur Zuständigkeit und zur Fristenüberwachung gebraucht
   *  werden (siehe js/meldung.js).                                          */
  async function melden(nutzlast) {
    if (!scharf()) {
      console.info("[API] Probelauf – es wurde nichts gespeichert:", nutzlast);
      await new Promise(r => setTimeout(r, 600));
      return { ok: true, probelauf: true };
    }
    const d = await ruf({ aktion: "meldung", ...nutzlast });
    if (d.ok === false) throw new Error(d.fehler || "Die Meldung wurde nicht angenommen.");
    return { ok: true, probelauf: false };
  }

  /** Postfach öffnen. Der Server bekommt nur die Kennung zu sehen, nie den
   *  Code – und kann mit ihr nichts entschlüsseln.                          */
  async function postfach(fall, kennung) {
    if (!scharf()) throw new Error("Probelauf: Es gibt noch keine gespeicherten Fälle.");
    const d = await ruf({ aktion: "postfach", fall, kennung });
    if (d.ok === false) throw new Error(d.fehler || "Fall nicht gefunden.");
    return d;
  }

  /** Nachricht des Hinweisgebers an die Meldestelle (bereits verschlüsselt). */
  async function nachricht(fall, kennung, chiffre) {
    if (!scharf()) throw new Error("Probelauf: Es lässt sich nichts senden.");
    const d = await ruf({ aktion: "nachricht", fall, kennung, chiffre });
    if (d.ok === false) throw new Error(d.fehler || "Die Nachricht wurde nicht angenommen.");
    return d;
  }

  return { scharf, start, melden, postfach, nachricht,
           PROBE_GESELLSCHAFTEN, PROBE_THEMEN };
})();
