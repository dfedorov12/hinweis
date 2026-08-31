/* Prüfung der Verschlüsselung (js/krypto.js)
   ══════════════════════════════════════════

   Warum dieser Test existiert: Ein Fehler in der Krypto meldet sich nicht.
   Ein falsch abgeleiteter Schlüssel wirft keine Warnung, er macht nur den
   Fall stumm unlesbar – und zwar erst Wochen später, wenn ein Compliance
   Officer ihn öffnen will und die Rückmeldefrist schon läuft. Deshalb wird
   hier nicht geprüft, ob die Funktionen „durchlaufen", sondern ob die
   drei Wege zum Inhalt wirklich zum Inhalt führen und alle anderen nicht.

   Aufruf:  node tests/test-krypto.mjs                                      */

import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

globalThis.crypto = webcrypto;

// js/krypto.js ist eine Browserdatei ohne Import/Export – sie wird hier so
// ausgewertet, wie der Browser sie sieht, damit genau der Code geprüft wird,
// der später ausgeliefert wird (kein Nachbau, keine zweite Wahrheit).
globalThis.HINWEIS_CONFIG = {
  krypto: {
    rsaBits: 2048,
    // Im Test bewusst niedrig: 310 000 Runden × mehrere Fälle dauern Minuten.
    // Die Zahlen selbst sind nicht das Prüfobjekt, die Ableitungslogik ist es.
    pbkdf2Passphrase: 1000,
    pbkdf2Code: 1000,
    codeLaenge: 16
  }
};
const quelle = readFileSync(new URL("../js/krypto.js", import.meta.url), "utf8");
new Function(quelle + "\nglobalThis.KRYPTO = KRYPTO;")();
const K = globalThis.KRYPTO;

let ok = 0, fehler = 0;
const pruefe = (name, bedingung, zusatz = "") => {
  if (bedingung) { ok++; console.log(`  ✓ ${name}`); }
  else { fehler++; console.log(`  ✗ ${name}${zusatz ? "  → " + zusatz : ""}`); }
};
const wirft = async (name, fn) => {
  try { await fn(); pruefe(name, false, "hätte fehlschlagen müssen"); }
  catch { pruefe(name, true); }
};

const inhalt = {
  sachverhalt: "Der Einkäufer hat vom Lieferanten eine Reise nach Mallorca angenommen.",
  betroffene:  "Einkauf, Herr X, Lieferant Y GmbH",
  wann: "seit Frühjahr 2025", wo: "Meuselwitz", wie: "über den privaten Mailverkehr",
  umlaute: "Gießerei, Betriebsprüfung, Größenordnung – „Anführungszeichen“ · 30 % · ≤"
};

console.log("\nFallnummer und Zugangscode");
{
  const fn = K.fallnummer(), code = K.zugangscode();
  pruefe("Fallnummer hat die Form JJJJ-XXXX-XXXX", /^\d{4}-[^-]{4}-[^-]{4}$/.test(fn), fn);
  pruefe("Fallnummer beginnt mit dem aktuellen Jahr",
    fn.startsWith(String(new Date().getFullYear())), fn);
  pruefe("Zugangscode hat 16 Zeichen in 4er-Gruppen",
    /^([^-]{4}-){3}[^-]{4}$/.test(code), code);

  const alle = (fn.slice(5) + code).replace(/-/g, "");
  pruefe("nur Zeichen aus dem Alphabet",
    [...alle].every(c => K.ALPHABET.includes(c)), alle);
  pruefe("keine verwechselbaren Zeichen (0 1 I L O)",
    !/[01ILO]/.test(alle), alle);

  // Zwei Codes hintereinander dürfen sich nie gleichen; bei 80 Bit wäre
  // eine Wiederholung ein Zeichen dafür, dass gar kein Zufall im Spiel ist.
  const menge = new Set(Array.from({ length: 200 }, () => K.zugangscode()));
  pruefe("200 Codes sind 200 verschiedene", menge.size === 200, `${menge.size}`);

  // Gleichverteilung grob prüfen: Bei Modulo-Verzerrung wären die ersten
  // Zeichen des Alphabets deutlich häufiger als die letzten.
  const zaehl = {};
  for (const c of Array.from({ length: 600 }, () => K.zugangscode()).join("").replace(/-/g, "")) {
    zaehl[c] = (zaehl[c] || 0) + 1;
  }
  const werte = Object.values(zaehl);
  const spanne = Math.max(...werte) / Math.min(...werte);
  pruefe("Zeichen sind halbwegs gleich verteilt (keine Modulo-Verzerrung)",
    werte.length === 31 && spanne < 1.6, `Verhältnis häufigstes/seltenstes = ${spanne.toFixed(2)}`);
}

console.log("\nNormalisierung der Eingabe");
{
  pruefe("Bindestriche und Leerzeichen fallen weg",
    K.normalisieren(" 4k7m-9qx2 bvth—3nrd ") === "4K7M9QX2BVTH3NRD",
    K.normalisieren(" 4k7m-9qx2 bvth—3nrd "));
  pruefe("Kleinbuchstaben werden groß", K.normalisieren("abc") === "ABC");
  pruefe("unbekannte Zeichen bleiben stehen (statt den Code zu verkürzen)",
    K.normalisieren("4K7I") === "4K7I");
  pruefe("unbekannte Zeichen werden gemeldet",
    K.unbekannteZeichen("4K7I-9QL2").join("") === "IL",
    K.unbekannteZeichen("4K7I-9QL2").join(","));
  pruefe("gültiger Code meldet keine unbekannten Zeichen",
    K.unbekannteZeichen(K.zugangscode()).length === 0);
}

console.log("\nInhalt verschlüsseln und wieder öffnen");
{
  const fk = await K.fallSchluessel();
  const chiffre = await K.schliessen(fk, inhalt);
  pruefe("Chiffre ist Base64", /^[A-Za-z0-9+/]+=*$/.test(chiffre));
  pruefe("Klartext steht nicht in der Chiffre",
    !atob(chiffre).includes("Mallorca") && !chiffre.includes("Mallorca"));

  const zurueck = await K.oeffnen(fk, chiffre);
  pruefe("Inhalt kommt unverändert zurück",
    JSON.stringify(zurueck) === JSON.stringify(inhalt));
  pruefe("Umlaute und Anführungszeichen überstehen die Runde",
    zurueck.umlaute === inhalt.umlaute, zurueck.umlaute);

  // Zweimal dasselbe verschlüsseln muss zwei verschiedene Chiffren geben,
  // sonst verrät die Gleichheit zweier Fälle, dass sie denselben Inhalt haben.
  const nochmal = await K.schliessen(fk, inhalt);
  pruefe("gleicher Inhalt ergibt zweimal verschiedene Chiffre", chiffre !== nochmal);

  // Ein verändertes Byte muss auffallen (AES-GCM prüft die Echtheit mit).
  const roh = K.vonB64(chiffre);
  roh[roh.length - 5] ^= 0xff;
  await wirft("manipulierte Chiffre wird abgewiesen",
    () => K.oeffnen(fk, K.b64(roh)));

  const fremd = await K.fallSchluessel();
  await wirft("fremder Fallschlüssel öffnet nicht", () => K.oeffnen(fremd, chiffre));
}

console.log("\nWeg 1: der Hinweisgeber mit seinem Zugangscode");
{
  const fall = K.fallnummer();
  const code = K.zugangscode();
  const fk   = await K.fallSchluessel();
  const chiffre = await K.schliessen(fk, inhalt);
  const paket   = await K.fuerCodeVerpacken(fk, code, fall);

  const wieder = await K.mitCodeOeffnen(paket, code, fall);
  pruefe("richtiger Code öffnet den Fall",
    JSON.stringify(await K.oeffnen(wieder, chiffre)) === JSON.stringify(inhalt));

  pruefe("Schreibweise egal: Kleinbuchstaben ohne Bindestriche gehen auch",
    await K.oeffnen(await K.mitCodeOeffnen(paket, code.toLowerCase().replace(/-/g, " "), fall),
      chiffre).then(o => o.sachverhalt === inhalt.sachverhalt));

  await wirft("falscher Code öffnet nicht",
    () => K.mitCodeOeffnen(paket, K.zugangscode(), fall));
  await wirft("richtiger Code, falsche Fallnummer öffnet nicht",
    () => K.mitCodeOeffnen(paket, code, K.fallnummer()));
}

console.log("\nKennung: was in SharePoint steht, verrät nichts");
{
  const fall = K.fallnummer();
  const code = K.zugangscode();
  const kennung = await K.codeKennung(code, fall);

  pruefe("Kennung ist 64 Hex-Zeichen (SHA-256)", /^[0-9a-f]{64}$/.test(kennung));
  pruefe("Kennung ist reproduzierbar", await K.codeKennung(code, fall) === kennung);
  pruefe("Schreibweise ändert die Kennung nicht",
    await K.codeKennung(code.toLowerCase().replace(/-/g, ""), fall) === kennung);
  pruefe("anderer Code → andere Kennung",
    await K.codeKennung(K.zugangscode(), fall) !== kennung);
  pruefe("gleicher Code, anderer Fall → andere Kennung",
    await K.codeKennung(code, K.fallnummer()) !== kennung);

  // Der Kern der Trennung: Die gespeicherte Kennung darf nicht zufällig
  // dasselbe sein wie das Schlüsselmaterial. Wäre sie es, hätte jeder mit
  // Leserecht auf die Liste zugleich den Schlüssel.
  const fk = await K.fallSchluessel();
  const paket = await K.fuerCodeVerpacken(fk, code, fall);
  pruefe("Kennung taucht im Schlüsselpaket nicht auf", !paket.includes(kennung));
  await wirft("Kennung selbst öffnet den Fall nicht",
    () => K.mitCodeOeffnen(paket, kennung, fall));
}

console.log("\nWeg 2: der Compliance Officer mit seinem privaten Schlüssel");
{
  const passphrase = "Ein langer Satz, den nur ich kenne 2026!";
  const officer = await K.paarErzeugen(passphrase);

  pruefe("öffentlicher Schlüssel ist da", officer.pubB64.length > 300);
  pruefe("privater Schlüssel liegt nur verschlüsselt vor", officer.privEnc.length > 1000);
  pruefe("Notfallschlüssel hat Code-Form", /^([^-]{4}-){3}[^-]{4}$/.test(officer.notfall));
  pruefe("Notfall-Paket unterscheidet sich vom Passphrase-Paket",
    officer.privEnc !== officer.privNot);

  const fp = await K.fingerabdruck(officer.pubB64);
  pruefe("Fingerabdruck ist vier Vierergruppen", /^([0-9A-F]{4} ){3}[0-9A-F]{4}$/.test(fp), fp);
  pruefe("Fingerabdruck ist reproduzierbar", await K.fingerabdruck(officer.pubB64) === fp);

  const fall = K.fallnummer();
  const fk = await K.fallSchluessel();
  const chiffre = await K.schliessen(fk, inhalt);
  const paket = await K.fuerBearbeiterVerpacken(fk, officer.pubB64);

  const priv = await K.privatOeffnen(officer.privEnc, passphrase, officer.salz);
  const wieder = await K.mitBearbeiterOeffnen(paket, priv);
  pruefe("Officer öffnet den Fall mit seiner Passphrase",
    JSON.stringify(await K.oeffnen(wieder, chiffre)) === JSON.stringify(inhalt));

  const privNot = await K.privatOeffnen(officer.privNot, officer.notfall, officer.salz, true);
  pruefe("Notfallschlüssel aus dem Tresor öffnet ebenfalls",
    (await K.oeffnen(await K.mitBearbeiterOeffnen(paket, privNot), chiffre)).wo === inhalt.wo);
  pruefe("Notfallschlüssel auch in Kleinschreibung ohne Striche",
    await K.privatOeffnen(officer.privNot,
      officer.notfall.toLowerCase().replace(/-/g, ""), officer.salz, true)
      .then(() => true).catch(() => false));

  await wirft("falsche Passphrase öffnet nicht",
    () => K.privatOeffnen(officer.privEnc, passphrase + "x", officer.salz));
  await wirft("Passphrase am Notfall-Paket öffnet nicht",
    () => K.privatOeffnen(officer.privNot, passphrase, officer.salz, true));
  await wirft("Notfallschlüssel am Passphrase-Paket öffnet nicht",
    () => K.privatOeffnen(officer.privEnc, officer.notfall, officer.salz));

  const fremder = await K.paarErzeugen("andere Passphrase");
  const privFremd = await K.privatOeffnen(fremder.privEnc, "andere Passphrase", fremder.salz);
  await wirft("fremder Officer öffnet den Fall nicht",
    () => K.mitBearbeiterOeffnen(paket, privFremd));
}

console.log("\nZuständigkeit: nur wer verpackt wurde, kommt hinein");
{
  // Das ist die eigentliche Zugriffskontrolle dieser Anwendung. Sie steckt
  // nicht in der Oberfläche und nicht in SharePoint-Berechtigungen, sondern
  // darin, für wen der Fallschlüssel verpackt wurde. Ein lokaler Compliance
  // Officer sieht Fälle anderer Gesellschaften deshalb nicht nur nicht –
  // er KANN sie nicht lesen, auch nicht mit Vollzugriff auf die Liste.
  const pass = "Passphrase für den Test";
  const [cco, meuselwitz, arnstadt] = await Promise.all([
    K.paarErzeugen(pass), K.paarErzeugen(pass), K.paarErzeugen(pass)
  ]);

  const fk = await K.fallSchluessel();
  const chiffre = await K.schliessen(fk, inhalt);
  const schluessel = {
    cco:        await K.fuerBearbeiterVerpacken(fk, cco.pubB64),
    meuselwitz: await K.fuerBearbeiterVerpacken(fk, meuselwitz.pubB64)
  };

  const oeffnet = async (wer, id) => {
    if (!schluessel[id]) return false;
    try {
      const priv = await K.privatOeffnen(wer.privEnc, pass, wer.salz);
      await K.oeffnen(await K.mitBearbeiterOeffnen(schluessel[id], priv), chiffre);
      return true;
    } catch { return false; }
  };

  pruefe("Chief Compliance Officer kommt hinein", await oeffnet(cco, "cco"));
  pruefe("zuständiger lokaler Officer kommt hinein", await oeffnet(meuselwitz, "meuselwitz"));
  pruefe("unzuständiger Officer kommt nicht hinein", !(await oeffnet(arnstadt, "arnstadt")));

  // Nachträgliche Freigabe: Ein Officer, der den Fall lesen kann, packt den
  // Fallschlüssel für einen neu zuständigen Kollegen mit ein. Ohne das wären
  // Vertretungen und Zuständigkeitswechsel eine Sackgasse.
  const priv = await K.privatOeffnen(cco.privEnc, pass, cco.salz);
  const fkWieder = await K.mitBearbeiterOeffnen(schluessel.cco, priv);
  schluessel.arnstadt = await K.fuerBearbeiterVerpacken(fkWieder, arnstadt.pubB64);
  pruefe("nach Freigabe kommt der neue Officer hinein", await oeffnet(arnstadt, "arnstadt"));
}

console.log("\nAnhänge (Binärdaten)");
{
  const fk = await K.fallSchluessel();
  // Stückweise füllen: getRandomValues gibt höchstens 65 536 Byte am Stück
  // heraus – im Browser genauso wie hier. Für js/krypto.js ist das ohne
  // Belang (dort werden nur 12-Byte-IVs gezogen), für diesen Test nicht.
  const datei = new Uint8Array(200000);
  for (let i = 0; i < datei.length; i += 65536) {
    crypto.getRandomValues(datei.subarray(i, Math.min(i + 65536, datei.length)));
  }
  // Ein PNG-Kopf am Anfang: So sieht eine echte Datei aus, und so ließe sie
  // sich in der Chiffre wiedererkennen, wenn die Verschlüsselung nichts täte.
  datei.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

  const chiffre = await K.schliessenBinaer(fk, datei);
  pruefe("PNG-Kopf ist in der Chiffre nicht wiederzufinden",
    !K.b64(datei.slice(0, 8)).replace(/=+$/, "").split("").every((_, i) =>
      chiffre.startsWith(K.b64(datei.slice(0, 8)).slice(0, i + 1))));

  const zurueck = await K.oeffnenBinaer(fk, chiffre);
  pruefe("Datei kommt Byte für Byte zurück",
    zurueck.length === datei.length && zurueck.every((b, i) => b === datei[i]));

  const leer = await K.oeffnenBinaer(fk, await K.schliessenBinaer(fk, new Uint8Array(0)));
  pruefe("leere Datei bricht nichts", leer.length === 0);
}

console.log(`\n${ok} von ${ok + fehler} Prüfungen bestanden.`);
if (fehler) { console.log(`${fehler} FEHLGESCHLAGEN`); process.exit(1); }
