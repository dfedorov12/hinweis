"use strict";

/* Anmeldung und SharePoint-Zugriff für die Fallbearbeitung
   ════════════════════════════════════════════════════════

   Nur diese Hälfte der Anwendung meldet sich an. Die Meldeseite und das
   Postfach kennen diese Datei nicht einmal – sie wird dort bewusst nicht
   eingebunden, damit gar nicht erst versehentlich ein Token entsteht, wo
   Anonymität herrschen soll.

   Wichtig zum Verständnis der Sicherheitslage: Die Anmeldung entscheidet
   NUR, wer die Liste lesen darf. Ob jemand einen Fall auch INHALTLICH
   öffnen kann, entscheidet allein, ob der Fallschlüssel für seinen
   öffentlichen Schlüssel verpackt wurde (siehe js/krypto.js). Ein
   SharePoint-Administrator kommt also an die Zeilen, aber nicht an die
   Sachverhalte.                                                            */

const GRAPH = (() => {

  const C = () => HINWEIS_CONFIG;
  let msalInstanz = null;
  let konto = null;

  function instanz() {
    if (msalInstanz) return msalInstanz;
    msalInstanz = new msal.PublicClientApplication({
      auth: {
        clientId: C().clientId,
        authority: "https://login.microsoftonline.com/" + C().tenantId,
        redirectUri: location.origin + location.pathname
      },
      // sessionStorage statt localStorage: Beim Schließen des Browsers ist
      // die Anmeldung weg. In einer Meldestelle ist ein offen stehender
      // Rechner das größere Risiko als eine erneute Anmeldung.
      cache: { cacheLocation: "sessionStorage" }
    });
    return msalInstanz;
  }

  async function anmelden() {
    const m = instanz();
    await m.initialize?.();
    const antwort = await m.handleRedirectPromise();
    if (antwort?.account) {
      konto = antwort.account;
    } else {
      const konten = m.getAllAccounts();
      if (konten.length) {
        konto = konten[0];
      } else {
        await m.loginRedirect({ scopes: C().scopes });
        return null;
      }
    }
    m.setActiveAccount(konto);
    return konto;
  }

  function abmelden() {
    instanz().logoutRedirect({ account: konto });
  }

  async function token() {
    try {
      const r = await instanz().acquireTokenSilent({ scopes: C().scopes, account: konto });
      return r.accessToken;
    } catch (e) {
      await instanz().acquireTokenRedirect({ scopes: C().scopes });
      throw e;
    }
  }

  async function call(pfad, optionen = {}) {
    const t = await token();
    const url = pfad.startsWith("https://") ? pfad : "https://graph.microsoft.com/v1.0" + pfad;
    const r = await fetch(url, {
      ...optionen,
      headers: {
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        ...(optionen.headers || {})
      }
    });
    if (r.status === 204) return null;
    const daten = await r.json().catch(() => null);
    if (!r.ok) {
      const fehler = new Error(daten?.error?.message || `${r.status} ${r.statusText}`);
      fehler.status = r.status;
      fehler.code = daten?.error?.code;
      throw fehler;
    }
    return daten;
  }

  // ─────────────────────────────────────────────────── SharePoint

  let siteId = null;
  const listenId = {};
  let anlagenDrive = null;

  async function site() {
    if (siteId) return siteId;
    siteId = (await call("/sites/" + C().site)).id;
    return siteId;
  }

  async function liste(name) {
    if (listenId[name]) return listenId[name];
    const s = await site();
    const l = await call(`/sites/${s}/lists/${encodeURIComponent(name)}?$select=id`);
    listenId[name] = l.id;
    return l.id;
  }

  /** Alle Elemente einer Liste, Seite für Seite.
   *  `$top=999` statt der Standardgröße: Bei einigen hundert Fällen wären
   *  sonst ein Dutzend Runden nötig, und jede kostet spürbar Zeit, bevor
   *  überhaupt etwas auf dem Bildschirm steht.                             */
  async function elemente(listenName, felder = null) {
    const s = await site();
    const l = await liste(listenName);
    const auswahl = felder ? `&$select=id,fields&$expand=fields($select=${felder.join(",")})`
                           : "&$expand=fields";
    let url = `/sites/${s}/lists/${l}/items?$top=999${auswahl}`;
    const aus = [];
    while (url) {
      const d = await call(url);
      aus.push(...d.value.map(v => ({ id: v.id, ...v.fields })));
      url = d["@odata.nextLink"] || null;
    }
    return aus;
  }

  async function anlegen(listenName, felder) {
    const s = await site();
    const l = await liste(listenName);
    return call(`/sites/${s}/lists/${l}/items`, {
      method: "POST", body: JSON.stringify({ fields: felder })
    });
  }

  async function aendern(listenName, itemId, felder) {
    const s = await site();
    const l = await liste(listenName);
    return call(`/sites/${s}/lists/${l}/items/${itemId}/fields`, {
      method: "PATCH", body: JSON.stringify(felder)
    });
  }

  async function loeschen(listenName, itemId) {
    const s = await site();
    const l = await liste(listenName);
    return call(`/sites/${s}/lists/${l}/items/${itemId}`, { method: "DELETE" });
  }

  // ─────────────────────────────────────────────────── Anlagen

  async function anlagenDriveId() {
    if (anlagenDrive) return anlagenDrive;
    const s = await site();
    const d = await call(`/sites/${s}/drives`);
    const treffer = d.value.find(x => x.name === C().anlagenBibliothek);
    if (!treffer) {
      throw new Error(`Die Bibliothek „${C().anlagenBibliothek}" wurde auf der Site `
        + "nicht gefunden. Bitte provision-hinweis-listen.ps1 ausführen.");
    }
    anlagenDrive = treffer.id;
    return anlagenDrive;
  }

  /** Verschlüsselten Anhang holen. Zurück kommt Base64 – entschlüsselt wird
   *  erst im Browser mit dem Fallschlüssel.                                */
  async function anlageLesen(fall, nr) {
    const d = await anlagenDriveId();
    const pfad = `/drives/${d}/root:/${encodeURIComponent(fall)}/${nr}.bin:/content`;
    const t = await token();
    const r = await fetch("https://graph.microsoft.com/v1.0" + pfad,
      { headers: { Authorization: "Bearer " + t } });
    if (!r.ok) throw new Error(`Anhang ${nr} nicht abrufbar (${r.status}).`);
    return r.text();
  }

  async function anlagenOrdnerLoeschen(fall) {
    const d = await anlagenDriveId();
    try {
      await call(`/drives/${d}/root:/${encodeURIComponent(fall)}`, { method: "DELETE" });
    } catch (e) {
      if (e.status !== 404) throw e;   // Kein Ordner = nichts zu löschen
    }
  }

  // ─────────────────────────────────────────────────── Sonstiges

  const ich = () => call("/me?$select=displayName,mail,userPrincipalName");

  /** Nachricht an einen Compliance Officer. Enthält NIE Fallinhalte –
   *  E-Mail ist unverschlüsselt und läuft über Exchange, wo sie jeder
   *  Postfachadministrator lesen könnte. Deshalb steht darin immer nur
   *  „Fall X wartet", nie worum es geht.                                   */
  async function mailSenden(an, betreff, text) {
    return call("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: betreff,
          body: { contentType: "Text", content: text },
          toRecipients: [{ emailAddress: { address: an } }]
        },
        saveToSentItems: false
      })
    });
  }

  return {
    anmelden, abmelden, call, ich, mailSenden,
    elemente, anlegen, aendern, loeschen,
    anlageLesen, anlagenOrdnerLoeschen,
    konto: () => konto
  };
})();
