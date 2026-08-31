"use strict";

/* Verschlüsselung – der eigentliche Grund, warum diese Anwendung
   „rechtskonform" heißen darf
   ══════════════════════════════════════════════════════════════

   § 8 HinSchG verlangt, dass die Identität des Hinweisgebers und der Inhalt
   der Meldung nur den Personen bekannt werden, die für die Bearbeitung
   zuständig sind. Eine gewöhnliche SharePoint-Liste erfüllt das nicht: Der
   Globaladministrator des Tenants kann jede Liste lesen, der Besitzer des
   Flows sieht dessen Ausführungsverlauf, und ein versehentlich geteilter
   Ordner reicht aus. Keiner der drei ist eine „zuständige Person" im Sinne
   des Gesetzes.

   Deshalb wird der Inhalt im Browser des Hinweisgebers verschlüsselt und
   erst wieder im Browser eines zuständigen Compliance Officers geöffnet.
   Dazwischen – in Power Automate, in SharePoint, in jedem Backup – liegt
   nur Chiffre.

   ── Wie ein Fall verschlossen wird ──────────────────────────────────

                    ┌──────────────────────────┐
                    │  Fallschlüssel (AES-256) │   für jeden Fall neu,
                    └────────────┬─────────────┘   rein zufällig
                                 │
          verschlüsselt  ────────┼────────  und wird selbst verpackt für:
                                 │
     ┌───────────────────────────┼─────────────────────────────┐
     │                           │                             │
  Sachverhalt              Zugangscode                Öffentliche Schlüssel
  Nachrichten              des Hinweisgebers          der zuständigen
  Anhänge                  (PBKDF2 → AES-GCM)         Compliance Officer
                                                      (RSA-OAEP)

   Damit gibt es genau zwei Wege zum Inhalt: den Zettel mit dem Zugangscode
   und den privaten Schlüssel eines zuständigen Officers. Sonst keinen.

   ── Was daraus folgt (bitte lesen, bevor etwas geändert wird) ───────

   1. Der Zugangscode wird NIRGENDS gespeichert. Was in SharePoint steht,
      ist eine PBKDF2-Ableitung mit einem ANDEREN Zweck-Präfix als der
      Schlüssel. Wer die Liste stiehlt, hat damit nichts gewonnen. Ohne
      getrennte Präfixe wäre die gespeicherte Kennung selbst der Schlüssel –
      ein Fehler, den man in fertigen Systemen tatsächlich findet.
   2. Geht der Code verloren, ist der Rückweg zum Hinweisgeber zu. Der Fall
      bleibt für die Meldestelle lesbar. Das ist die richtige Richtung des
      Ausfalls, muss aber auf der Seite unmissverständlich dastehen.
   3. Verliert ein Officer seine Passphrase, hilft der Notfallschlüssel aus
      dem Tresor. Fehlt beides, können andere Officer den Fall erneut
      freigeben – solange mindestens einer noch herankommt. Deshalb wird
      JEDER Fall grundsätzlich für ALLE zuständigen Officer verpackt, nie
      nur für einen.
   4. Die Werte in `HINWEIS_CONFIG.krypto` sind Teil des Dateiformats. Sie
      zu ändern macht Bestandsfälle unlesbar.                              */

const KRYPTO = (() => {

  const C  = () => HINWEIS_CONFIG.krypto;
  const sc = crypto.subtle;

  /* Zeichenvorrat für Fallnummern und Zugangscodes: Base32 ohne die
     Zeichen, die man beim Abschreiben verwechselt – kein 0/O, kein 1/I/L.
     Wer den Code vom Bildschirm auf einen Zettel überträgt, soll ihn danach
     auch eintippen können. Das ist kein Schönheitsfehler, sondern der
     Unterschied zwischen erreichbarem und verlorenem Hinweisgeber.         */
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  // ───────────────────────────────────────────────────────────── Hilfen

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const zufall = n => crypto.getRandomValues(new Uint8Array(n));

  function b64(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function vonB64(s) {
    const roh = atob(s);
    const b = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) b[i] = roh.charCodeAt(i);
    return b;
  }

  const hex = buf => Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  /** Zufallszeichen aus ALPHABET, ohne Modulo-Verzerrung.
   *  31 Zeichen passen nicht glatt in 256, deshalb werden Bytes ab der
   *  Grenze verworfen statt heruntergerechnet – sonst kämen die ersten
   *  Zeichen des Alphabets häufiger vor. Bei einem Zugangscode zählt das. */
  function zeichen(n) {
    const grenze = 256 - (256 % ALPHABET.length);
    let out = "";
    while (out.length < n) {
      for (const b of zufall(n * 2)) {
        if (b >= grenze) continue;
        out += ALPHABET[b % ALPHABET.length];
        if (out.length === n) break;
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────── Fallnummer und Code

  /** Fallnummer, z. B. „2026-4K7M-9QX2".
   *  Das Jahr vorn ist für die Meldestelle (Sortierung, Aktenzeichen), der
   *  Rest ist Zufall. Bewusst NICHT fortlaufend: Eine fortlaufende Nummer
   *  müsste zentral vergeben werden, und aus „Fall 17" ließe sich ablesen,
   *  wie viele Meldungen es gibt und die wievielte die eigene war.        */
  function fallnummer() {
    return `${new Date().getFullYear()}-${zeichen(4)}-${zeichen(4)}`;
  }

  /** Zugangscode des Hinweisgebers, gruppiert dargestellt:
   *  „4K7M-9QX2-BVTH-3NRD" (16 Zeichen à 5 Bit = 80 Bit Zufall).          */
  function zugangscode() {
    const roh = zeichen(C().codeLaenge);
    return (roh.match(/.{1,4}/g) || [roh]).join("-");
  }

  /** Eingabe auf die Form bringen, mit der gerechnet wurde: Großbuchstaben,
   *  ohne Bindestriche und Leerzeichen.
   *
   *  Bewusst wird hier NICHT geraten: 0, 1, I, L und O kommen im Alphabet
   *  gar nicht vor, ein solches Zeichen in der Eingabe ist also immer ein
   *  Abschreibfehler – aber auf welches gültige Zeichen er zielte, ist
   *  nicht zu erkennen. Sie einfach zu entfernen würde den Code stillschwei-
   *  gend verkürzen und aus einem Tippfehler ein unerklärliches „Code
   *  ungültig" machen. Sie bleiben deshalb stehen, die Prüfung schlägt fehl,
   *  und die Seite kann gezielt melden, welches Zeichen es nicht gibt.     */
  function normalisieren(s) {
    return String(s || "").toUpperCase().replace(/[\s\-–—_.]/g, "");
  }

  /** Zeichen der Eingabe, die es im Alphabet nicht gibt – für eine
   *  brauchbare Fehlermeldung im Postfach („I gibt es nicht, meinten Sie J?"). */
  function unbekannteZeichen(s) {
    const gesehen = new Set();
    for (const c of normalisieren(s)) if (!ALPHABET.includes(c)) gesehen.add(c);
    return [...gesehen];
  }

  // ────────────────────────────────────────────── Schlüsselableitungen

  /** PBKDF2 mit Zweck-Präfix im Salz.
   *  Das Präfix ist der Grund, warum aus derselben Eingabe zwei völlig
   *  verschiedene Ergebnisse entstehen: einmal der Schlüssel, mit dem
   *  entschlüsselt wird, und einmal die Kennung, die in SharePoint steht. */
  async function ausPassphrase(passphrase, zweck, salzTeil, iterationen, form) {
    const basis = await sc.importKey("raw", enc.encode(passphrase),
      "PBKDF2", false, ["deriveKey", "deriveBits"]);
    const salz = enc.encode(`dihag-hinweis:${zweck}:${salzTeil}`);
    const p = { name: "PBKDF2", salt: salz, iterations: iterationen, hash: "SHA-256" };
    if (form === "bits") return sc.deriveBits(p, basis, 256);
    return sc.deriveKey(p, basis, { name: "AES-GCM", length: 256 },
      false, ["encrypt", "decrypt"]);
  }

  /** Schlüssel, mit dem der Fallschlüssel für den Hinweisgeber verpackt wird. */
  const codeSchluessel = (code, fall) =>
    ausPassphrase(normalisieren(code), "code-schluessel", fall, C().pbkdf2Code, "key");

  /** Kennung, unter der das Postfach den Fall findet. Steht in SharePoint.
   *  Aus ihr lässt sich weder der Code zurückrechnen (80 Bit Zufall,
   *  150 000 PBKDF2-Runden) noch der Schlüssel ableiten (anderes Präfix). */
  async function codeKennung(code, fall) {
    return hex(await ausPassphrase(normalisieren(code), "code-kennung", fall,
      C().pbkdf2Code, "bits"));
  }

  // ────────────────────────────────────────────────────── Fallschlüssel

  const fallSchluessel = () =>
    sc.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  const _mitIv = (iv, ct) => {
    const z = new Uint8Array(iv.length + ct.byteLength);
    z.set(iv, 0);
    z.set(new Uint8Array(ct), iv.length);
    return b64(z);
  };

  /** Beliebiges Objekt verschlüsseln → Base64 aus 12 Byte IV + Chiffre.
   *  Der IV steht vorn: Er muss nicht geheim sein, wird aber zum Öffnen
   *  gebraucht – ihn getrennt zu verwalten wäre eine zusätzliche Stelle,
   *  an der etwas verloren gehen kann.                                     */
  async function schliessen(schluessel, objekt) {
    const iv = zufall(12);
    return _mitIv(iv, await sc.encrypt({ name: "AES-GCM", iv },
      schluessel, enc.encode(JSON.stringify(objekt))));
  }

  async function oeffnen(schluessel, chiffreB64) {
    const roh = vonB64(chiffreB64);
    const kl = await sc.decrypt({ name: "AES-GCM", iv: roh.slice(0, 12) },
      schluessel, roh.slice(12));
    return JSON.parse(dec.decode(kl));
  }

  /** Wie `schliessen`, aber für Binärdaten (Anhänge). Kein JSON dazwischen –
   *  eine 3-MB-Datei durch JSON.stringify zu schicken würde sie erst als
   *  Zahlenliste auf ein Vielfaches aufblähen.                             */
  async function schliessenBinaer(schluessel, bytes) {
    const iv = zufall(12);
    return _mitIv(iv, await sc.encrypt({ name: "AES-GCM", iv }, schluessel, bytes));
  }

  async function oeffnenBinaer(schluessel, chiffreB64) {
    const roh = vonB64(chiffreB64);
    return new Uint8Array(await sc.decrypt({ name: "AES-GCM", iv: roh.slice(0, 12) },
      schluessel, roh.slice(12)));
  }

  // ──────────────────────────────────── Fallschlüssel verpacken/öffnen

  async function fuerCodeVerpacken(fallKey, code, fall) {
    const k = await codeSchluessel(code, fall);
    const iv = zufall(12);
    return _mitIv(iv, await sc.encrypt({ name: "AES-GCM", iv }, k,
      await sc.exportKey("raw", fallKey)));
  }

  async function mitCodeOeffnen(paket, code, fall) {
    const k = await codeSchluessel(code, fall);
    const roh = vonB64(paket);
    const kl = await sc.decrypt({ name: "AES-GCM", iv: roh.slice(0, 12) }, k, roh.slice(12));
    return sc.importKey("raw", kl, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  async function fuerBearbeiterVerpacken(fallKey, pubSpkiB64) {
    const pub = await sc.importKey("spki", vonB64(pubSpkiB64),
      { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    return b64(await sc.encrypt({ name: "RSA-OAEP" }, pub,
      await sc.exportKey("raw", fallKey)));
  }

  async function mitBearbeiterOeffnen(paket, privKey) {
    const roh = await sc.decrypt({ name: "RSA-OAEP" }, privKey, vonB64(paket));
    return sc.importKey("raw", roh, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  // ──────────────────────────────────────── Schlüsselpaar der Bearbeiter

  /** Neues Schlüsselpaar für einen Compliance Officer.
   *  Der private Schlüssel verlässt den Browser nur verschlüsselt – einmal
   *  mit der Passphrase (Alltag) und einmal mit dem Notfallschlüssel
   *  (Tresor). Zwei Wege, weil eine vergessene Passphrase sonst den Zugriff
   *  auf laufende Verfahren kostet und Fristen nicht warten.               */
  async function paarErzeugen(passphrase) {
    const paar = await sc.generateKey({
      name: "RSA-OAEP",
      modulusLength: C().rsaBits,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    }, true, ["encrypt", "decrypt"]);

    const pubB64  = b64(await sc.exportKey("spki", paar.publicKey));
    const privRoh = new Uint8Array(await sc.exportKey("pkcs8", paar.privateKey));

    const salz    = zeichen(16);
    const notfall = zugangscode();

    // Der Notfallschlüssel wird NORMALISIERT verpackt, die Passphrase nicht.
    // Grund: Der Notfallschlüssel wird ausgedruckt und später abgetippt – ob
    // dabei die Bindestriche mitkommen, darf nicht über den Zugriff auf
    // laufende Verfahren entscheiden. Eine Passphrase tippt man dagegen so,
    // wie man sie gesetzt hat; sie stillschweigend zu verändern würde ihr
    // Zeichen kosten.
    const [privEnc, privNot] = await Promise.all([
      _privVerpacken(privRoh, passphrase,             salz),
      _privVerpacken(privRoh, normalisieren(notfall), salz + ":notfall")
    ]);

    privRoh.fill(0);   // Rohform überschreiben, sobald sie ausgedient hat
    return { pubB64, privEnc, privNot, salz, notfall };
  }

  async function _privVerpacken(privRoh, geheimnis, salz) {
    const k  = await ausPassphrase(geheimnis, "privat", salz,
      C().pbkdf2Passphrase, "key");
    const iv = zufall(12);
    return _mitIv(iv, await sc.encrypt({ name: "AES-GCM", iv }, k, privRoh));
  }

  /** Privaten Schlüssel öffnen – mit Passphrase oder Notfallschlüssel.
   *  Bei falscher Eingabe wirft AES-GCM (die Prüfsumme passt nicht), ein
   *  try/catch beim Aufrufer genügt deshalb als Passwortprüfung.           */
  async function privatOeffnen(paket, geheimnis, salz, notfall = false) {
    const k = await ausPassphrase(notfall ? normalisieren(geheimnis) : geheimnis,
      "privat", notfall ? salz + ":notfall" : salz, C().pbkdf2Passphrase, "key");
    const roh = vonB64(paket);
    const kl = await sc.decrypt({ name: "AES-GCM", iv: roh.slice(0, 12) }, k, roh.slice(12));
    return sc.importKey("pkcs8", kl, { name: "RSA-OAEP", hash: "SHA-256" },
      false, ["decrypt"]);
  }

  /** Fingerabdruck eines öffentlichen Schlüssels, vier Gruppen à vier Hex-
   *  Zeichen. Damit lässt sich prüfen, ob wirklich der eigene Schlüssel
   *  hinterlegt ist – ein untergeschobener fremder Schlüssel würde die
   *  ganze Verschlüsselung aushebeln, ohne dass irgendetwas kaputtginge.   */
  async function fingerabdruck(pubSpkiB64) {
    const h = hex(await sc.digest("SHA-256", vonB64(pubSpkiB64))).slice(0, 16);
    return (h.match(/.{4}/g) || []).join(" ").toUpperCase();
  }

  return {
    ALPHABET, fallnummer, zugangscode, normalisieren, unbekannteZeichen,
    codeKennung, fallSchluessel,
    schliessen, oeffnen, schliessenBinaer, oeffnenBinaer,
    fuerCodeVerpacken, mitCodeOeffnen,
    fuerBearbeiterVerpacken, mitBearbeiterOeffnen,
    paarErzeugen, privatOeffnen, fingerabdruck,
    b64, vonB64
  };
})();

if (typeof module !== "undefined") module.exports = { KRYPTO };
