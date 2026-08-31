"use strict";

/* Ausgabe einer Fallakte und der Statistik
   ════════════════════════════════════════

   Die Dokumentation zur Altlösung stellte die Frage, ob eine Speicherung in
   Word und PDF nicht sinnvoller wäre als CSV. Sie ist es – aber nicht für
   dasselbe:

     Word / PDF   die einzelne Fallakte. Ein Fall ist ein Fließtext mit
                  Verlauf und Vermerken; in einer CSV-Zeile wird daraus
                  eine unlesbare Wurst mit Semikolons.
     CSV          die Statistik über viele Fälle. Dafür ist eine Tabelle
                  genau richtig, und dafür braucht es keinen Freitext.

   Deshalb gibt es hier beides, aber getrennt nach Zweck.

   Alles entsteht im Browser. Ein Export über einen Server hieße, den
   entschlüsselten Fall noch einmal durch fremde Hände zu schicken – dann
   wäre die ganze Verschlüsselung umsonst.                                  */

const EXPORT = (() => {

  const escape = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const absatz = s => escape(s).split(/\r?\n/).join("<br>");

  const datum = w => {
    if (!w) return "–";
    const d = new Date(w);
    return isNaN(d) ? String(w) : d.toLocaleDateString("de-DE",
      { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const zeitpunkt = w => {
    if (!w) return "–";
    const d = new Date(w);
    return isNaN(d) ? String(w) : d.toLocaleString("de-DE",
      { dateStyle: "short", timeStyle: "short" });
  };

  /** Die Fallakte als HTML – Grundlage für Word und PDF gleichermaßen. */
  function akteHtml(fall, inhalt, nachrichten, doku) {
    const zeile = (b, w) => w
      ? `<tr><th style="text-align:left;width:190pt;vertical-align:top">${escape(b)}</th>`
        + `<td>${absatz(w)}</td></tr>`
      : "";

    const felder = [
      ["Was? (Sachverhalt)", inhalt?.was],
      ["Wer ist betroffen?", inhalt?.wer],
      ["Wann?", inhalt?.wann],
      ["Wo?", inhalt?.wo],
      ["Wie?", inhalt?.wie],
      ["Beteiligter Lieferant", inhalt?.lieferant],
      ["Objektive Anhaltspunkte", inhalt?.belege]
    ];

    const verlauf = nachrichten.length
      ? nachrichten.map(n => `
          <p style="margin:0 0 10pt 0">
            <b>${n.Richtung === "Meldestelle" ? "Meldestelle" : "Hinweisgeber"}</b>
            <span style="color:#666"> · ${zeitpunkt(n.Gesendet)}</span><br>
            ${absatz(n.__text || "[nicht entschlüsselbar]")}
          </p>`).join("")
      : "<p><i>Keine Nachrichten.</i></p>";

    const protokoll = doku.length
      ? `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">
           <tr><th align="left">Zeitpunkt</th><th align="left">Aktion</th>
               <th align="left">Bearbeiter</th><th align="left">Einzelheiten</th></tr>
           ${doku.map(d => `<tr><td>${zeitpunkt(d.Zeitpunkt)}</td><td>${escape(d.Aktion)}</td>`
             + `<td>${escape(d.Akteur)}</td><td>${absatz(d.Einzelheiten)}</td></tr>`).join("")}
         </table>`
      : "<p><i>Keine Einträge.</i></p>";

    return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<title>Fallakte ${escape(fall.Title)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Calibri, "Segoe UI", sans-serif; font-size: 11pt; color: #222; }
  h1 { color: #17509E; font-size: 20pt; margin: 0 0 2pt; }
  h2 { color: #1A2644; font-size: 13pt; border-bottom: 1pt solid #ccd9e6;
       padding-bottom: 2pt; margin: 20pt 0 8pt; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; padding: 3pt 4pt; }
  .kopf { color: #666; font-size: 9pt; margin-bottom: 14pt; }
  .vertraulich { border: 1.5pt solid #b02a37; color: #b02a37; padding: 6pt 10pt;
                 font-weight: bold; margin-bottom: 14pt; }
</style></head><body>

<div class="vertraulich">
  VERTRAULICH – Hinweisgeberschutz. Der Inhalt dieses Dokuments unterliegt dem
  Vertraulichkeitsgebot nach § 8 HinSchG. Weitergabe nur an die für die Bearbeitung
  zuständigen Personen. Nicht in allgemein zugänglichen Ablagen speichern.
</div>

<h1>Fallakte ${escape(fall.Title)}</h1>
<div class="kopf">
  DIHAG Foundry Group · Interne Meldestelle ·
  Ausgedruckt am ${zeitpunkt(new Date().toISOString())}
</div>

<h2>Stammdaten</h2>
<table>
  ${zeile("Fallnummer", fall.Title)}
  ${zeile("Eingegangen am", datum(fall.Eingang))}
  ${zeile("Es handelt sich um", fall.Art)}
  ${zeile("Thema", fall.Thema)}
  ${zeile("Betroffene Gesellschaft", fall.Gesellschaft)}
  ${zeile("Betroffener Bereich", fall.Bereich)}
  ${zeile("Bedeutung", fall.Bedeutung)}
  ${zeile("Status", fall.Status)}
  ${zeile("Fallbearbeiter", fall.Bearbeiter)}
  ${zeile("Rückfragen zugelassen", fall.Rueckfragen === false ? "Nein" : "Ja")}
  ${zeile("Persönliches Treffen gewünscht", fall.Treffen ? "Ja" : "Nein")}
  ${zeile("Eingangsbestätigung", datum(fall.EingangsbestaetigungAm))}
  ${zeile("Rückmeldung fällig bis", datum(fall.RueckmeldungBis))}
  ${zeile("Rückmeldung erfolgt am", datum(fall.RueckmeldungAm))}
  ${zeile("Abgeschlossen am", datum(fall.AbschlussAm))}
  ${zeile("Ergebnis", fall.Ergebnis)}
  ${zeile("Folgemaßnahme", fall.Massnahme)}
  ${zeile("Zu löschen am", datum(fall.LoeschenAm))}
</table>

<h2>Meldung</h2>
<table>${felder.map(([b, w]) => zeile(b, w)).join("")}</table>
${(inhalt?.anhaenge || []).length
  ? `<p><b>Anhänge:</b> ${inhalt.anhaenge.map(a => escape(a.name)).join(", ")}</p>`
  : ""}

<h2>Anonymer Dialog</h2>
${verlauf}

<h2>Dokumentation (§ 11 HinSchG)</h2>
${protokoll}

</body></html>`;
  }

  function laden(name, inhalt, typ) {
    const url = URL.createObjectURL(new Blob(["﻿" + inhalt], { type: typ }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Word: HTML mit Word-Namensräumen, Endung .doc.
   *  Kein echtes .docx – dafür bräuchte es eine ZIP-Bibliothek von einem
   *  fremden Server, und genau die soll diese Anwendung nicht laden. Word,
   *  LibreOffice und Pages öffnen diese Datei anstandslos.                 */
  const alsWord = (fall, inhalt, nachrichten, doku) =>
    laden(`Fallakte_${fall.Title}.doc`, akteHtml(fall, inhalt, nachrichten, doku),
      "application/msword");

  /** PDF über das Druckfenster des Browsers („Als PDF speichern").
   *  Der Weg über ein neues Fenster statt window.print() der Hauptseite ist
   *  Absicht: So wird genau die Akte gedruckt und nicht die Oberfläche
   *  drumherum – und im Ausdruck steht nichts, was gerade zufällig offen war. */
  function alsPdf(fall, inhalt, nachrichten, doku) {
    const w = window.open("", "_blank");
    if (!w) {
      alert("Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.");
      return;
    }
    w.document.write(akteHtml(fall, inhalt, nachrichten, doku));
    w.document.close();
    w.focus();
    // Kurz warten, bis die Schriften stehen – sonst druckt Chrome gelegentlich
    // eine halb aufgebaute Seite.
    setTimeout(() => w.print(), 400);
  }

  /** Statistik als CSV.
   *
   *  Bewusst ohne jeden Freitext. Eine Statistik, in der der Sachverhalt
   *  mitläuft, ist keine Statistik mehr, sondern eine Kopie der Akte in
   *  einer Datei, die erfahrungsgemäß per Mail weitergereicht wird.
   *
   *  Semikolon als Trennzeichen und BOM, weil die Datei in aller Regel in
   *  einem deutschen Excel geöffnet wird und dort sonst alles in einer
   *  Spalte landet.                                                        */
  function statistik(faelle) {
    const spalten = [
      ["Fallnummer", f => f.Title],
      ["Eingegangen", f => datum(f.Eingang)],
      ["Art", f => f.Art],
      ["Thema", f => f.Thema],
      ["Gesellschaft", f => f.Gesellschaft],
      ["Bereich", f => f.Bereich],
      ["Bedeutung", f => f.Bedeutung],
      ["Status", f => f.Status],
      ["Eingangsbestaetigung", f => datum(f.EingangsbestaetigungAm)],
      ["Rueckmeldung faellig", f => datum(f.RueckmeldungBis)],
      ["Rueckmeldung erfolgt", f => datum(f.RueckmeldungAm)],
      ["Abgeschlossen", f => datum(f.AbschlussAm)],
      ["Ergebnis", f => f.Ergebnis],
      ["Folgemassnahme", f => f.Massnahme],
      ["Bearbeitungsdauer in Tagen", f => {
        if (!f.Eingang || !f.AbschlussAm) return "";
        return Math.round((new Date(f.AbschlussAm) - new Date(f.Eingang)) / 86400000);
      }]
    ];

    // Zellen, die mit = + - @ beginnen, entschärfen: Excel führt sie sonst
    // als Formel aus. Bei Werten aus einer Auswahlliste unwahrscheinlich,
    // aber eine CSV-Datei wandert weiter, und der Schutz kostet nichts.
    const zelle = w => {
      let s = String(w ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const zeilen = [spalten.map(s => zelle(s[0])).join(";")];
    for (const f of faelle) zeilen.push(spalten.map(s => zelle(s[1](f))).join(";"));

    const stand = new Date().toISOString().slice(0, 10);
    laden(`Hinweise_Statistik_${stand}.csv`, zeilen.join("\r\n"),
      "text/csv;charset=utf-8");
    return zeilen.length - 1;
  }

  return { alsWord, alsPdf, statistik, akteHtml };
})();
