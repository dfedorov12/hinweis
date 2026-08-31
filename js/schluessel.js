"use strict";

/* Wer ist Compliance Officer, und wie kommt er an seinen Schlüssel?
   ═════════════════════════════════════════════════════════════════

   Anders als in den Schwesteranwendungen liegt die Berechtigung NICHT in
   der zentralen Liste `AppPermissions`. Das hat einen Grund, der über
   Geschmack hinausgeht: Wer in `AppPermissions` steht, ist dort für jeden
   sichtbar, der eine der anderen Anwendungen benutzt. Die Liste der
   Personen, die Hinweise lesen dürfen, gehört aber nicht in eine allgemeine
   Rechteliste – sie ist selbst eine schützenswerte Information (§ 8 HinSchG
   spricht ausdrücklich von den „zuständigen Personen").

   Maßgeblich ist deshalb `Hinweis_Bearbeiter` auf der Meldestellen-Site:

     Title           E-Mail des Officers (Schlüssel des Eintrags)
     Anzeigename     für die Oberfläche
     Rolle           „Chief Compliance Officer" | „Compliance Officer"
     Gesellschaften  Semikolonliste, „*" für alle
     PubKey          öffentlicher Schlüssel (SPKI, Base64)
     PrivKeyEnc      privater Schlüssel, mit der Passphrase verschlossen
     PrivKeyNot      derselbe, mit dem Notfallschlüssel verschlossen
     KdfSalt         Salz der Schlüsselableitung
     Aktiv           Ja/Nein

   Zwei Schichten also, und sie tun Verschiedenes:

     Eintrag in der Liste  →  darf die Fallübersicht ÖFFNEN
     Schlüssel im Fall     →  darf den Fall LESEN

   Die zweite Schicht ist die eigentliche: Ein Officer ohne passenden
   Schlüssel sieht in der Übersicht, DASS es einen Fall gibt (Datum,
   Gesellschaft, Status), aber kein Wort seines Inhalts. Und dagegen hilft
   auch kein Administratorrecht.                                            */

const SCHLUESSEL = (() => {

  const C = () => HINWEIS_CONFIG;

  const ich = {
    email: "", name: "",
    eintrag: null,        // Zeile aus Hinweis_Bearbeiter
    rolle: "",
    gesellschaften: [],
    privat: null,         // entsperrter privater Schlüssel (nur im Speicher)
    hauptAdmin: false
  };

  let alle = [];          // alle Bearbeiter-Zeilen

  const istCCO = () => ich.rolle === "Chief Compliance Officer";

  const zerlegen = s => String(s || "").split(";")
    .map(x => x.trim()).filter(Boolean);

  /** Anmelden und den eigenen Eintrag suchen. */
  async function laden() {
    const me = await GRAPH.ich();
    ich.name = me.displayName || "";
    ich.email = String(me.mail || me.userPrincipalName || "").toLowerCase();
    ich.hauptAdmin = (C().hauptAdmins || [])
      .some(m => m.toLowerCase() === ich.email);

    alle = await GRAPH.elemente(C().lists.bearbeiter);

    ich.eintrag = alle.find(b =>
      String(b.Title || "").toLowerCase() === ich.email) || null;

    if (ich.eintrag) {
      ich.rolle = ich.eintrag.Rolle || "Compliance Officer";
      ich.gesellschaften = zerlegen(ich.eintrag.Gesellschaften);
    }
    return ich;
  }

  /** Darf die Fallübersicht überhaupt geöffnet werden?
   *  Der Haupt-Administrator kommt hinein, damit die Anwendung beim ersten
   *  Start eingerichtet werden kann – er hat aber KEINEN Schlüssel und
   *  sieht deshalb keinen einzigen Fallinhalt. Genau so soll es sein.      */
  const darfRein = () =>
    ich.hauptAdmin || (ich.eintrag && ich.eintrag.Aktiv !== false);

  const darfVerwalten = () => ich.hauptAdmin || istCCO();

  /** Ist dieser Fall für mich zuständig gemeldet?
   *  Das steuert nur die Anzeige der Liste. Ob ich ihn LESEN kann, hängt
   *  allein am Schlüssel – siehe Kopf dieser Datei.                        */
  function zustaendigFuer(gesellschaft) {
    if (istCCO() || ich.gesellschaften.includes("*")) return true;
    return ich.gesellschaften.includes(gesellschaft);
  }

  // ────────────────────────────────────── Schlüsselpaar einrichten

  const hatSchluessel = () => !!(ich.eintrag && ich.eintrag.PubKey);
  const istEntsperrt  = () => !!ich.privat;

  /** Erstes Schlüsselpaar anlegen.
   *  Gibt den Notfallschlüssel zurück – EINMALIG. Er wird nicht gespeichert
   *  und lässt sich nicht noch einmal anzeigen; wer ihn nicht ausdruckt,
   *  hat ihn verloren.                                                     */
  async function paarAnlegen(passphrase) {
    if (!ich.eintrag) {
      throw new Error("Für " + ich.email + " gibt es keinen Eintrag in "
        + C().lists.bearbeiter + ". Bitte zuerst vom Chief Compliance Officer "
        + "anlegen lassen.");
    }
    if (hatSchluessel()) {
      throw new Error("Es ist bereits ein Schlüssel hinterlegt. Ein neuer würde "
        + "alle bisherigen Fälle unlesbar machen.");
    }

    const paar = await KRYPTO.paarErzeugen(passphrase);
    await GRAPH.aendern(C().lists.bearbeiter, ich.eintrag.id, {
      PubKey: paar.pubB64,
      PrivKeyEnc: paar.privEnc,
      PrivKeyNot: paar.privNot,
      KdfSalt: paar.salz,
      SchluesselAm: new Date().toISOString()
    });

    Object.assign(ich.eintrag, {
      PubKey: paar.pubB64, PrivKeyEnc: paar.privEnc,
      PrivKeyNot: paar.privNot, KdfSalt: paar.salz
    });
    ich.privat = await KRYPTO.privatOeffnen(paar.privEnc, passphrase, paar.salz);

    await DOKU.schreiben("", "Schlüsselpaar angelegt",
      `Fingerabdruck ${await KRYPTO.fingerabdruck(paar.pubB64)}`);

    return { notfall: paar.notfall, fingerabdruck: await KRYPTO.fingerabdruck(paar.pubB64) };
  }

  /** Privaten Schlüssel für diese Sitzung entsperren. */
  async function entsperren(geheimnis, mitNotfall = false) {
    if (!hatSchluessel()) throw new Error("Für dieses Konto ist kein Schlüssel hinterlegt.");
    const paket = mitNotfall ? ich.eintrag.PrivKeyNot : ich.eintrag.PrivKeyEnc;
    if (!paket) {
      throw new Error(mitNotfall
        ? "Für dieses Konto ist kein Notfallschlüssel hinterlegt."
        : "Für dieses Konto ist kein mit Passphrase gesicherter Schlüssel hinterlegt.");
    }
    try {
      ich.privat = await KRYPTO.privatOeffnen(paket, geheimnis,
        ich.eintrag.KdfSalt, mitNotfall);
    } catch {
      throw new Error(mitNotfall
        ? "Der Notfallschlüssel ist nicht richtig."
        : "Die Passphrase ist nicht richtig.");
    }
    return true;
  }

  /** Passphrase ändern. Setzt den Notfallschlüssel bewusst NICHT neu: Der
   *  liegt im Tresor, und ihn bei jeder Passwortänderung auszutauschen
   *  hieße, dass der Zettel dort still veraltet.                           */
  async function passphraseAendern(alt, neu) {
    await entsperren(alt);                       // prüft die alte Passphrase
    const roh = await crypto.subtle.exportKey("pkcs8", await reExport(alt));
    const salz = ich.eintrag.KdfSalt;
    const neuPaket = await neuVerpacken(new Uint8Array(roh), neu, salz);
    await GRAPH.aendern(C().lists.bearbeiter, ich.eintrag.id, { PrivKeyEnc: neuPaket });
    ich.eintrag.PrivKeyEnc = neuPaket;
    await DOKU.schreiben("", "Passphrase geändert", "");
  }

  /* Für den Wechsel der Passphrase muss der private Schlüssel kurz in
     exportierbarer Form vorliegen. Im Alltag ist er das NICHT (siehe
     KRYPTO.privatOeffnen), damit ihn kein Skript aus dem Speicher ziehen
     kann. Deshalb wird er hier eigens noch einmal ausgepackt und sofort
     wieder verworfen.                                                      */
  async function reExport(passphrase) {
    const roh = KRYPTO.vonB64(ich.eintrag.PrivKeyEnc);
    const k = await ableiten(passphrase, ich.eintrag.KdfSalt);
    const kl = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: roh.slice(0, 12) }, k, roh.slice(12));
    return crypto.subtle.importKey("pkcs8", kl,
      { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
  }

  async function ableiten(geheimnis, salz) {
    const basis = await crypto.subtle.importKey("raw",
      new TextEncoder().encode(geheimnis), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "PBKDF2",
      salt: new TextEncoder().encode(`dihag-hinweis:privat:${salz}`),
      iterations: C().krypto.pbkdf2Passphrase, hash: "SHA-256"
    }, basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function neuVerpacken(privRoh, geheimnis, salz) {
    const k = await ableiten(geheimnis, salz);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, privRoh);
    const z = new Uint8Array(12 + ct.byteLength);
    z.set(iv, 0);
    z.set(new Uint8Array(ct), 12);
    privRoh.fill(0);
    return KRYPTO.b64(z);
  }

  // ────────────────────────────────────── Fall öffnen und freigeben

  /** Fallschlüssel aus der Schlüsseltabelle eines Falls holen.
   *  Liefert null, wenn dieser Officer nicht dabei ist – das ist kein
   *  Fehler, sondern die vorgesehene Antwort auf „nicht zuständig".        */
  async function fallOeffnen(schluesselJson) {
    if (!ich.privat) return null;
    let tabelle;
    try { tabelle = JSON.parse(schluesselJson || "{}"); } catch { return null; }
    const meins = tabelle[String(ich.eintrag.id)];
    if (!meins) return null;
    try { return await KRYPTO.mitBearbeiterOeffnen(meins, ich.privat); }
    catch { return null; }
  }

  /** Alle aktiven Officer, die für eine Gesellschaft zuständig sind und
   *  einen Schlüssel haben.                                                */
  function zustaendigeOfficer(gesellschaft) {
    return alle.filter(b => {
      if (b.Aktiv === false || !b.PubKey) return false;
      const g = zerlegen(b.Gesellschaften);
      return g.includes("*") || g.includes(gesellschaft);
    });
  }

  /** Einen Fall nachträglich für weitere Officer öffnen.
   *
   *  Ohne das wäre jede Vertretung und jeder Zuständigkeitswechsel eine
   *  Sackgasse: Ein Officer, der nach dem Eingang der Meldung hinzukommt,
   *  hätte keinen Schlüssel und könnte den Fall nie lesen – auch dann
   *  nicht, wenn er ihn übernehmen soll. Weil das Freigeben inhaltlich
   *  eine Erweiterung des Kreises der Mitwisser ist, wird es in der
   *  Dokumentation festgehalten (§ 11 HinSchG).                            */
  async function freigeben(fall, fallKey, empfaenger) {
    if (!empfaenger.length) return 0;
    const tabelle = JSON.parse(fall.SchluesselJson || "{}");
    let neu = 0;
    for (const b of empfaenger) {
      if (tabelle[String(b.id)]) continue;
      tabelle[String(b.id)] = await KRYPTO.fuerBearbeiterVerpacken(fallKey, b.PubKey);
      neu++;
    }
    if (!neu) return 0;
    await GRAPH.aendern(C().lists.faelle, fall.id, {
      SchluesselJson: JSON.stringify(tabelle)
    });
    fall.SchluesselJson = JSON.stringify(tabelle);
    await DOKU.schreiben(fall.Title, "Zugriff erweitert",
      `Fall für ${neu} weitere(n) Bearbeiter freigegeben: `
      + empfaenger.map(b => b.Title).join(", "));
    return neu;
  }

  return {
    ich, laden, darfRein, darfVerwalten, istCCO, zustaendigFuer,
    hatSchluessel, istEntsperrt, paarAnlegen, entsperren, passphraseAendern,
    fallOeffnen, zustaendigeOfficer, freigeben,
    alleBearbeiter: () => alle,
    sperren: () => { ich.privat = null; }
  };
})();


/* Dokumentationspflicht (§ 11 HinSchG)
   ════════════════════════════════════

   „Die Meldestelle dokumentiert alle eingehenden Meldungen in dauerhaft
   abrufbarer Weise." In der Praxis heißt das: Jeder Schritt der Bearbeitung
   muss später nachvollziehbar sein – wer wann was entschieden hat.

   Die Einträge sind bewusst NICHT verschlüsselt: Sie enthalten keine
   Inhalte, sondern Vorgänge („Status auf In Bearbeitung gesetzt"). Damit
   bleiben sie für eine Prüfung lesbar, ohne dass jemand einen Fallschlüssel
   braucht – und der Cron kann Fristen überwachen, ohne etwas entschlüsseln
   zu müssen. Wo doch einmal Inhalt nötig ist, gehört er in eine Nachricht,
   nicht hierher.                                                           */

const DOKU = (() => {

  const C = () => HINWEIS_CONFIG;

  async function schreiben(fall, aktion, einzelheiten = "") {
    try {
      await GRAPH.anlegen(C().lists.dokumentation, {
        Title: fall || "(allgemein)",
        Fallnummer: fall || "",
        Aktion: aktion,
        Einzelheiten: String(einzelheiten).slice(0, 4000),
        Akteur: SCHLUESSEL.ich.email,
        Zeitpunkt: new Date().toISOString()
      });
    } catch (e) {
      // Ein misslungener Protokolleintrag darf die Bearbeitung nicht
      // blockieren – aber lautlos verschwinden darf er auch nicht, sonst
      // fehlt am Ende in der Akte etwas, ohne dass es jemand gemerkt hat.
      console.error("[DOKU] Eintrag nicht gespeichert:", aktion, e);
      if (typeof window !== "undefined" && window.__dokuFehler) window.__dokuFehler(aktion, e);
    }
  }

  const lesen = async fall =>
    (await GRAPH.elemente(C().lists.dokumentation))
      .filter(d => d.Fallnummer === fall)
      .sort((a, b) => new Date(a.Zeitpunkt) - new Date(b.Zeitpunkt));

  return { schreiben, lesen };
})();
