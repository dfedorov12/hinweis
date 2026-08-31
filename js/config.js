"use strict";

/* Zentrale Konfiguration – DIHAG Hinweisgebersystem („HINWEIS")
   ═════════════════════════════════════════════════════════════

   Die Anwendung hat zwei Hälften mit bewusst gegensätzlichen Anforderungen.
   Sie teilen sich diese Datei, aber sonst nichts:

   • index.html / postfach.html   Meldung abgeben und anonymes Postfach.
                                  KEINE Anmeldung, keine Cookies, kein Graph.
                                  Sprechen ausschließlich den Power-Automate-
                                  Endpunkt (`endpunkt`) an. Alles, was hier
                                  steht, ist ohnehin öffentlich.

   • bearbeitung.html             Fallbearbeitung durch die Meldestelle.
                                  Anmeldung über Entra (`clientId`), liest per
                                  Graph aus SharePoint. Wer hier hereindarf,
                                  steht in `Hinweis_Bearbeiter`.

   Was die beiden Hälften NICHT teilen, ist der Schlüssel: Die Inhalte werden
   im Browser des Hinweisgebers verschlüsselt (siehe js/krypto.js) und können
   nur von den zuständigen Compliance Officern wieder geöffnet werden. In
   SharePoint steht Chiffre; wer die Liste liest, liest Buchstabensalat.      */

const HINWEIS_CONFIG = {

  /* ── Anmeldung (nur Fallbearbeitung) ──────────────────────────────── */
  tenantId: "fdb70646-023a-403b-a4b9-1f474a935123",

  // App-Registrierung „DIHAG Hinweisgebersystem".
  // Unter „Authentifizierung → Single-Page-Anwendung" müssen BEIDE
  // Redirect-URIs eingetragen sein (setup-hinweis-app.ps1 erledigt das):
  //   https://hinweis.dihag.de/bearbeitung.html
  //   https://dfedorov12.github.io/hinweis/bearbeitung.html
  clientId: "",   // ← nach setup-hinweis-app.ps1 eintragen

  scopes: [
    "User.Read",
    "Sites.ReadWrite.All",   // Fälle lesen/ändern, Dokumentation schreiben
    "Mail.Send"              // Benachrichtigung an Bearbeiter (nie an Hinweisgeber)
  ],

  /* ── SharePoint ───────────────────────────────────────────────────
     Eigene Site, NICHT /sites/IT. Die Fälle gehören der Meldestelle, nicht
     der IT – auch wenn die Inhalte verschlüsselt sind, ist schon die reine
     Existenz eines Falls zu einer Gesellschaft eine Information.            */
  site: "dihag.sharepoint.com:/sites/Meldestelle",
  lists: {
    faelle:        "Hinweis_Faelle",
    nachrichten:   "Hinweis_Nachrichten",
    dokumentation: "Hinweis_Dokumentation",
    bearbeiter:    "Hinweis_Bearbeiter",
    konfiguration: "Hinweis_Konfiguration"
  },
  anlagenBibliothek: "Hinweis_Anlagen",

  /* ── Annahmestelle für anonyme Meldungen ──────────────────────────
     Adresse des Power-Automate-Flows („Wenn eine HTTP-Anforderung eingeht",
     siehe flow/ANLEITUNG-FLOW.md). Sie enthält eine Signatur und ist damit
     öffentlich – unvermeidbar bei diesem Trigger und der Preis dafür, dass
     sich niemand anmelden muss. Wer die Adresse kennt, kann Meldungen
     einsenden; lesen kann er nichts, entschlüsseln erst recht nicht.

     Solange das Feld leer ist, läuft die Meldeseite im Probelauf: Das
     Formular funktioniert vollständig samt Verschlüsselung, gespeichert
     wird aber nichts.                                                       */
  endpunkt: "",

  /* ── Verschlüsselung ──────────────────────────────────────────────
     Diese Werte gehen in die Schlüsselableitung ein. Sie NACHTRÄGLICH zu
     ändern macht alle bestehenden Fälle unlesbar. Wenn geändert werden
     muss, dann nur mit Migrationsskript und nur, wenn kein Fall offen ist. */
  krypto: {
    rsaBits: 2048,              // RSA-OAEP, SHA-256 – Schlüssel der Bearbeiter
    pbkdf2Passphrase: 310000,   // Iterationen für die Passphrase des Bearbeiters
    pbkdf2Code: 150000,         // Iterationen für den Zugangscode des Hinweisgebers
    codeLaenge: 16              // Zeichen à 5 Bit = 80 Bit Zufall
  },

  /* ── Anhänge ──────────────────────────────────────────────────────
     Werden im Browser verschlüsselt und als Base64 durch den Flow gereicht.
     Base64 bläht um ein Drittel auf; die Grenze bezieht sich auf die
     Originaldatei. Mehr als 3 MB gehen durch den Flow nicht zuverlässig.    */
  maxAnhangBytes: 3 * 1024 * 1024,
  maxAnhaenge: 5,

  /* ── Fristen nach HinSchG (Vorgabewerte) ──────────────────────────
     Maßgeblich sind die Werte in der Liste `Hinweis_Konfiguration`; diese
     hier gelten nur, solange die Liste noch leer ist.
       §17 Abs. 1 Nr. 1  Eingangsbestätigung  spätestens nach 7 Tagen
       §17 Abs. 1 Nr. 6  Rückmeldung          spätestens nach 3 Monaten
       §11 Abs. 5        Löschung             3 Jahre nach Abschluss         */
  fristen: {
    eingangsbestaetigungTage: 7,
    rueckmeldungTage: 90,
    erinnerungVorTagen: 14,     // Vorwarnung, bevor die Rückmeldefrist reißt
    unbearbeitetEskalationTage: 5,
    aufbewahrungJahre: 3
  },

  /* ── Schutz vor maschinellen Einsendungen ─────────────────────────
     Kein CAPTCHA: Das lädt Ressourcen von einem Fremdanbieter nach und
     verrät ihm damit, dass hier jemand eine Meldung schreibt. Stattdessen
     ein Honigtopf-Feld und eine Mindestdauer – beides ohne Datenabfluss.    */
  mindestDauerSek: 20,

  /* ── Öffentliche Adresse (für Aushang und QR-Code) ────────────────── */
  adresse: "https://hinweis.dihag.de/",

  /* ── Externe Meldestelle (§ 7 Abs. 3 HinSchG Hinweispflicht) ───────
     Auf die externe Meldestelle MUSS hingewiesen werden. Kein Beiwerk:
     Wer sie verschweigt, macht das interne Verfahren angreifbar.            */
  externeMeldestelle: {
    name: "Externe Meldestelle des Bundes beim Bundesamt für Justiz",
    url:  "https://www.bundesjustizamt.de/hinweisgeberstelle"
  }
};
