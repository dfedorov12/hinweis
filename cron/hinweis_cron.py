#!/usr/bin/env python3
"""Fristenwaechter des DIHAG Hinweisgebersystems (App-only, Microsoft Graph).

Laeuft taeglich ueber GitHub Actions und erledigt, was die Weboberflaeche
nicht kann - naemlich hinsehen, wenn niemand hinsieht:

  1. Rueckmeldefrist nach Paragraph 17 Abs. 1 Nr. 6 HinSchG (drei Monate)
     Vorwarnung und Eskalation an den Chief Compliance Officer.
  2. Eingangsbestaetigung nach Paragraph 17 Abs. 1 Nr. 1 HinSchG (sieben Tage)
     Sollte nie anschlagen - der Flow setzt sie sofort. Wenn doch, ist etwas
     kaputt, und das muss auffallen.
  3. Unbearbeitete Faelle: liegt eine Meldung mehrere Tage ohne zugewiesenen
     Bearbeiter, geht sie an den Chief Compliance Officer.
  4. Faellige Wiedervorlagen.
  5. Loeschung nach Paragraph 11 Abs. 5 HinSchG (drei Jahre nach Abschluss):
     Chiffre, Schluesseltabelle, Nachrichten und Anhaenge werden entfernt.
     Die anonyme Statistikzeile bleibt.

WAS DIESES SKRIPT NICHT KANN - und zwar mit Absicht
---------------------------------------------------
Es kann keinen einzigen Fall lesen. Es besitzt keinen privaten Schluessel und
kaeme auch mit Vollzugriff auf die Liste nicht an einen Sachverhalt heran. Es
rechnet ausschliesslich mit Datumsspalten und Statuswerten, die im Klartext
in der Liste stehen. Deshalb duerfen in den Mails, die es verschickt, auch
nur Fallnummern stehen - niemals ein Thema, niemals ein Inhalt.

Nur Python-Standardbibliothek. Konfiguration ueber Umgebungsvariablen,
siehe cron/README.md.
"""

import os
import sys
import json
import datetime
import urllib.request
import urllib.parse
import urllib.error

# GitHub setzt eine fehlende Secret-Variable als LEEREN String, nicht gar nicht.
# os.environ["..."] schlaegt deshalb NICHT fehl - der Lauf lief bis zur
# Anmeldung weiter und scheiterte dort mit einem nackten "HTTP Error 404",
# weil aus dem leeren Mandanten die Adresse
# https://login.microsoftonline.com//oauth2/v2.0/token wurde.
# Bei einem Waechter fuer gesetzliche Fristen ist das die schlechteste Sorte
# Fehlermeldung: Sie schickt die Suche zu Graph, obwohl die Einrichtung fehlt.
_FEHLT = []


def _pflicht(name):
    wert = os.environ.get(name, "").strip()
    if not wert:
        _FEHLT.append(name)
    return wert


TENANT   = _pflicht("HINWEIS_TENANT_ID")
CLIENT   = _pflicht("HINWEIS_CLIENT_ID")
SECRET   = _pflicht("HINWEIS_CLIENT_SECRET")

if _FEHLT:
    print("Der Fristenwaechter ist nicht eingerichtet.\n", file=sys.stderr)
    print("  Es fehlen: " + ", ".join(_FEHLT), file=sys.stderr)
    print("  Anzulegen unter Settings -> Secrets and variables -> Actions;", file=sys.stderr)
    print("  welche Werte hineingehoeren, steht in cron/README.md (Abschnitt 3).\n", file=sys.stderr)
    print("  Solange sie fehlen, ueberwacht NIEMAND die Fristen aus", file=sys.stderr)
    print("  Paragraph 17 HinSchG und die Loeschung nach Paragraph 11 Abs. 5.", file=sys.stderr)
    print("  Dieser Lauf bleibt deshalb absichtlich rot: Ein gruener Lauf, der", file=sys.stderr)
    print("  nichts tut, waere hier gefaehrlicher als ein sichtbarer Fehler.", file=sys.stderr)
    sys.exit(1)
HOST     = os.environ.get("HINWEIS_SITE_HOST", "dihag.sharepoint.com")
SITEPATH = os.environ.get("HINWEIS_SITE_PATH", "/sites/Meldestelle")
SENDER   = os.environ.get("HINWEIS_SENDER", "administrator@dihag.com")
APP_URL  = os.environ.get("HINWEIS_APP_URL", "https://hinweis.dihag.de/")
TROCKEN  = os.environ.get("HINWEIS_TROCKEN", "").lower() in ("1", "true", "ja")

VORWARNUNG_TAGE   = int(os.environ.get("HINWEIS_VORWARNUNG_TAGE", "14"))
UNBEARBEITET_TAGE = int(os.environ.get("HINWEIS_UNBEARBEITET_TAGE", "5"))
BESTAETIGUNG_TAGE = int(os.environ.get("HINWEIS_BESTAETIGUNG_TAGE", "7"))

L_FAELLE   = "Hinweis_Faelle"
L_NACHR    = "Hinweis_Nachrichten"
L_DOKU     = "Hinweis_Dokumentation"
L_BEARB    = "Hinweis_Bearbeiter"
LIB_ANLAGEN = "Hinweis_Anlagen"

GRAPH = "https://graph.microsoft.com/v1.0"
HEUTE = datetime.datetime.now(datetime.timezone.utc)

OFFEN = ("Neu", "In Bearbeitung", "Rueckfrage", "Rückfrage")


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def get_token():
    data = urllib.parse.urlencode({
        "client_id": CLIENT,
        "client_secret": SECRET,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }).encode()
    url = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data)) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        # Die Antwort von Entra nennt den Grund (AADSTS...) - ohne sie steht im
        # Protokoll nur eine Zahl, und die Suche beginnt an der falschen Stelle.
        grund = ""
        try:
            grund = json.loads(e.read().decode()).get("error_description", "").split("\r\n")[0]
        except Exception:
            pass
        raise SystemExit(
            f"Anmeldung bei Microsoft fehlgeschlagen (HTTP {e.code}).\n"
            f"  Mandant:   {TENANT}\n"
            f"  Anwendung: {CLIENT}\n"
            + (f"  Grund:     {grund}\n" if grund else "")
            + "  Zu pruefen: Stimmen HINWEIS_TENANT_ID und HINWEIS_CLIENT_ID? Ist das\n"
              "  Client-Secret abgelaufen? (Entra -> App-Registrierung -> Zertifikate\n"
              "  & Geheimnisse; danach das Secret im Repo erneuern.)"
        )


TOKEN = get_token()


def api(method, path, body=None, roh=False):
    url = path if path.startswith("http") else GRAPH + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode() if not roh else None
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}")


SITE_ID = api("GET", f"/sites/{HOST}:{SITEPATH}")["id"]


def alle(liste):
    aus, url = [], f"/sites/{SITE_ID}/lists/{liste}/items?expand=fields&$top=999"
    while url:
        d = api("GET", url)
        aus += d["value"]
        url = d.get("@odata.nextLink")
    return aus


def aendern(liste, item_id, felder):
    if TROCKEN:
        print(f"    [trocken] {liste}/{item_id} <- {felder}")
        return
    api("PATCH", f"/sites/{SITE_ID}/lists/{liste}/items/{item_id}/fields", felder)


def anlegen(liste, felder):
    if TROCKEN:
        print(f"    [trocken] neu in {liste}: {felder.get('Aktion', felder.get('Title'))}")
        return
    api("POST", f"/sites/{SITE_ID}/lists/{liste}/items", {"fields": felder})


def loeschen(liste, item_id):
    if TROCKEN:
        print(f"    [trocken] loeschen {liste}/{item_id}")
        return
    api("DELETE", f"/sites/{SITE_ID}/lists/{liste}/items/{item_id}")


def doku(fall, aktion, einzelheiten=""):
    anlegen(L_DOKU, {
        "Title": fall or "(allgemein)",
        "Fallnummer": fall or "",
        "Aktion": aktion,
        "Einzelheiten": einzelheiten[:4000],
        "Akteur": "Fristenwaechter (Cron)",
        "Zeitpunkt": HEUTE.isoformat(),
    })


def mail(an, betreff, text):
    """Nachricht an einen Compliance Officer.

    Enthaelt NIE einen Fallinhalt und nie das Thema. Diese Mail laeuft
    unverschluesselt ueber Exchange und liegt anschliessend im Postfach und
    im Backup; jeder Postfachadministrator kann sie lesen. Was hier steht,
    ist damit faktisch nicht mehr vertraulich - also steht hier nur, DASS
    etwas zu tun ist, und wo man nachsieht.
    """
    if TROCKEN:
        print(f"    [trocken] Mail an {an}: {betreff}")
        return
    api("POST", f"/users/{SENDER}/sendMail", {
        "message": {
            "subject": betreff,
            "body": {"contentType": "Text", "content": text},
            "toRecipients": [{"emailAddress": {"address": an}}],
        },
        "saveToSentItems": False,
    })


# ---------------------------------------------------------------------------
# Hilfen
# ---------------------------------------------------------------------------

def datum(wert):
    if not wert:
        return None
    try:
        return datetime.datetime.fromisoformat(str(wert).replace("Z", "+00:00"))
    except ValueError:
        return None


def tage_bis(wert):
    d = datum(wert)
    return None if d is None else (d - HEUTE).days


def ist_wahr(wert):
    # SharePoint liefert Ja/Nein-Spalten mal als bool, mal als 0/1, mal als
    # Text - je nachdem, ob der Wert ueber Graph, den Flow oder die
    # Oberflaeche gesetzt wurde. Alle drei Formen muessen hier ankommen.
    return wert in (True, 1, "1", "true", "True", "Ja")


def empfaenger(bearbeiter, gesellschaft, fall_bearbeiter=None):
    """Wer wird benachrichtigt: der zustaendige Officer, sonst jeder CCO.

    Der CCO bekommt Eskalationen immer - auch dann, wenn ein lokaler Officer
    zustaendig ist. Genau darin besteht seine Aufgabe: zu bemerken, wenn eine
    Frist reisst, ohne dass jemand Bescheid sagt.
    """
    aus = []
    for b in bearbeiter:
        f = b["fields"]
        if not ist_wahr(f.get("Aktiv", True)):
            continue
        adresse = f.get("Title", "")
        if not adresse:
            continue
        zust = [g.strip() for g in str(f.get("Gesellschaften", "")).split(";")]
        if fall_bearbeiter and adresse.lower() == str(fall_bearbeiter).lower():
            aus.append(adresse)
        elif "*" in zust or gesellschaft in zust:
            aus.append(adresse)
    return sorted(set(aus))


def nur_cco(bearbeiter):
    return sorted({
        b["fields"].get("Title", "")
        for b in bearbeiter
        if ist_wahr(b["fields"].get("Aktiv", True))
        and b["fields"].get("Rolle") == "Chief Compliance Officer"
        and b["fields"].get("Title")
    })


# ---------------------------------------------------------------------------
# Aufgaben
# ---------------------------------------------------------------------------

def rueckmeldefrist(faelle, bearbeiter):
    """Paragraph 17 Abs. 1 Nr. 6 HinSchG - Rueckmeldung binnen drei Monaten."""
    print("\n[1] Rueckmeldefrist")
    vorgewarnt = eskaliert = 0

    for it in faelle:
        f = it["fields"]
        if f.get("Status") not in OFFEN:
            continue
        rest = tage_bis(f.get("RueckmeldungBis"))
        if rest is None:
            continue

        nr = f.get("Title", "?")
        an = empfaenger(bearbeiter, f.get("Gesellschaft"), f.get("Bearbeiter"))

        if rest < 0 and not ist_wahr(f.get("EskalationGesendet")):
            ziel = sorted(set(an + nur_cco(bearbeiter)))
            for adresse in ziel:
                mail(adresse,
                     f"FRIST UEBERSCHRITTEN: Hinweis {nr}",
                     f"Die gesetzliche Rueckmeldefrist ist ueberschritten.\n\n"
                     f"Fallnummer:   {nr}\n"
                     f"Gesellschaft: {f.get('Gesellschaft', '-')}\n"
                     f"Faellig war:  {str(f.get('RueckmeldungBis', ''))[:10]}\n"
                     f"Ueberzogen:   {abs(rest)} Tage\n\n"
                     f"Nach Paragraph 17 Abs. 1 Nr. 6 HinSchG ist dem Hinweisgeber\n"
                     f"binnen drei Monaten mitzuteilen, welche Folgemassnahmen\n"
                     f"ergriffen wurden. Bitte umgehend nachholen:\n\n"
                     f"{APP_URL}bearbeitung.html\n")
            aendern(L_FAELLE, it["id"], {"EskalationGesendet": True})
            doku(nr, "Fristueberschreitung gemeldet",
                 f"Rueckmeldefrist um {abs(rest)} Tage ueberschritten. "
                 f"Eskalation an: {', '.join(ziel)}")
            eskaliert += 1
            print(f"    {nr}: ueberfaellig seit {abs(rest)} Tagen -> Eskalation")

        elif 0 <= rest <= VORWARNUNG_TAGE and not ist_wahr(f.get("ErinnerungGesendet")):
            for adresse in an:
                mail(adresse,
                     f"Rueckmeldefrist laeuft ab: Hinweis {nr}",
                     f"Die Rueckmeldefrist naehert sich dem Ende.\n\n"
                     f"Fallnummer:   {nr}\n"
                     f"Gesellschaft: {f.get('Gesellschaft', '-')}\n"
                     f"Faellig am:   {str(f.get('RueckmeldungBis', ''))[:10]}\n"
                     f"Verbleibend:  {rest} Tage\n\n"
                     f"{APP_URL}bearbeitung.html\n")
            aendern(L_FAELLE, it["id"], {"ErinnerungGesendet": True})
            doku(nr, "Fristerinnerung versandt", f"Noch {rest} Tage bis zur Rueckmeldung.")
            vorgewarnt += 1
            print(f"    {nr}: noch {rest} Tage -> Erinnerung")

    print(f"    {vorgewarnt} Erinnerung(en), {eskaliert} Eskalation(en)")


def eingangsbestaetigung(faelle, bearbeiter):
    """Paragraph 17 Abs. 1 Nr. 1 HinSchG - Bestaetigung binnen sieben Tagen.

    Der Flow setzt sie beim Anlegen. Schlaegt das hier an, hat der Flow
    versagt - dann ist nicht die Frist das Problem, sondern die Anlage.
    """
    print("\n[2] Eingangsbestaetigung")
    offen = 0
    for it in faelle:
        f = it["fields"]
        if f.get("EingangsbestaetigungAm") or f.get("Status") not in OFFEN:
            continue
        alter = tage_bis(f.get("Eingang"))
        if alter is None or -alter < BESTAETIGUNG_TAGE:
            continue
        nr = f.get("Title", "?")
        for adresse in nur_cco(bearbeiter):
            mail(adresse,
                 f"STOERUNG: Eingangsbestaetigung fehlt bei {nr}",
                 f"Bei Fall {nr} ist keine Eingangsbestaetigung vermerkt,\n"
                 f"obwohl die Meldung vor {abs(alter)} Tagen einging.\n\n"
                 f"Normalerweise setzt der Annahme-Flow dieses Datum sofort.\n"
                 f"Fehlt es, funktioniert der Flow nicht richtig - bitte\n"
                 f"flow/ANLEITUNG-FLOW.md, Abschnitt 5.3 pruefen.\n")
        doku(nr, "STOERUNG: Eingangsbestaetigung fehlt",
             f"Seit {abs(alter)} Tagen kein Bestaetigungsdatum gesetzt.")
        offen += 1
        print(f"    {nr}: seit {abs(alter)} Tagen ohne Bestaetigung")
    print(f"    {offen} Fall/Faelle betroffen")


def unbearbeitet(faelle, bearbeiter):
    print("\n[3] Unbearbeitete Faelle")
    anzahl = 0
    for it in faelle:
        f = it["fields"]
        if f.get("Status") != "Neu" or f.get("Bearbeiter"):
            continue
        alter = tage_bis(f.get("Eingang"))
        if alter is None or -alter < UNBEARBEITET_TAGE:
            continue
        nr = f.get("Title", "?")
        ziel = sorted(set(empfaenger(bearbeiter, f.get("Gesellschaft"))
                          + nur_cco(bearbeiter)))
        for adresse in ziel:
            mail(adresse,
                 f"Unbearbeitet seit {abs(alter)} Tagen: Hinweis {nr}",
                 f"Fall {nr} ({f.get('Gesellschaft', '-')}) liegt seit\n"
                 f"{abs(alter)} Tagen ohne zugewiesenen Bearbeiter.\n\n"
                 f"Die Rueckmeldefrist laeuft ab dem Eingang, nicht ab dem\n"
                 f"ersten Blick in den Fall.\n\n{APP_URL}bearbeitung.html\n")
        doku(nr, "Erinnerung: unbearbeitet",
             f"Seit {abs(alter)} Tagen ohne Bearbeiter. An: {', '.join(ziel)}")
        anzahl += 1
        print(f"    {nr}: seit {abs(alter)} Tagen ohne Bearbeiter")
    print(f"    {anzahl} Fall/Faelle")


def wiedervorlagen(faelle, bearbeiter):
    print("\n[4] Wiedervorlagen")
    anzahl = 0
    for it in faelle:
        f = it["fields"]
        rest = tage_bis(f.get("WiedervorlageAm"))
        if rest is None or rest > 0 or ist_wahr(f.get("WvGesendet")):
            continue
        nr = f.get("Title", "?")
        ziel = ([f["Bearbeiter"]] if f.get("Bearbeiter")
                else empfaenger(bearbeiter, f.get("Gesellschaft")))
        for adresse in ziel:
            mail(adresse,
                 f"Wiedervorlage: Hinweis {nr}",
                 f"Sie hatten sich Fall {nr} auf heute vorgelegt.\n\n"
                 f"Notiz: {f.get('WiedervorlageGrund', '-')}\n\n"
                 f"{APP_URL}bearbeitung.html\n")
        aendern(L_FAELLE, it["id"], {"WvGesendet": True})
        anzahl += 1
        print(f"    {nr}: Wiedervorlage versandt")
    print(f"    {anzahl} Wiedervorlage(n)")


def loeschfristen(faelle):
    """Paragraph 11 Abs. 5 HinSchG - Loeschung drei Jahre nach Abschluss.

    Geloescht werden Chiffre, Schluesseltabelle, Nachrichten und Anhaenge.
    Die Zeile selbst bleibt mit Datum, Thema, Gesellschaft und Ergebnis
    stehen. Das ist kein Schlupfloch, sondern die Trennlinie: Nach dem
    Entfernen des Inhalts ist an der Zeile kein Personenbezug mehr moeglich -
    weder zum Hinweisgeber noch zu Betroffenen -, und die Gruppe kann
    weiterhin belegen, wie viele Meldungen es gab und wie sie ausgingen.
    Ohne diesen Rest liesse sich die Wirksamkeit des Meldekanals nicht
    nachweisen, die Paragraph 12 HinSchG verlangt.
    """
    print("\n[5] Loeschfristen")
    anzahl = 0
    nachrichten = alle(L_NACHR)

    for it in faelle:
        f = it["fields"]
        if ist_wahr(f.get("Geloescht")):
            continue
        rest = tage_bis(f.get("LoeschenAm"))
        if rest is None or rest > 0:
            continue

        nr = f.get("Title", "?")
        print(f"    {nr}: Loeschfrist seit {abs(rest)} Tagen erreicht")

        for n in nachrichten:
            if n["fields"].get("Fallnummer") == nr:
                loeschen(L_NACHR, n["id"])

        try:
            if not TROCKEN:
                api("DELETE", f"/sites/{SITE_ID}/drives/{anlagen_drive()}"
                              f"/root:/{urllib.parse.quote(nr)}")
        except RuntimeError as e:
            # 404 heisst: Es gab keine Anhaenge. Alles andere muss auffallen,
            # denn eine nicht geloeschte Anlage ist ein Verstoss, der still
            # bliebe, wenn wir hier grosszuegig waeren.
            if "404" not in str(e):
                print(f"      WARNUNG: Anhaenge nicht geloescht: {e}")

        aendern(L_FAELLE, it["id"], {
            "Chiffre": "",
            "SchluesselJson": "",
            "CodeKennung": "",
            "Bearbeiter": "",
            "WiedervorlageGrund": "",
            "AnzahlAnhaenge": 0,
            "Geloescht": True,
        })
        doku(nr, "Inhalt geloescht (Paragraph 11 Abs. 5 HinSchG)",
             "Chiffre, Schluesseltabelle, Nachrichten und Anhaenge entfernt. "
             "Die anonyme Statistikzeile bleibt bestehen.")
        anzahl += 1

    print(f"    {anzahl} Fall/Faelle geloescht")


_drive = {}


def anlagen_drive():
    if "id" not in _drive:
        drives = api("GET", f"/sites/{SITE_ID}/drives")["value"]
        treffer = [d for d in drives if d["name"] == LIB_ANLAGEN]
        if not treffer:
            raise RuntimeError(f"Bibliothek {LIB_ANLAGEN} nicht gefunden.")
        _drive["id"] = treffer[0]["id"]
    return _drive["id"]


def schluessel_pruefen(bearbeiter):
    """Ein aktiver Officer ohne Schluessel ist ein stiller Ausfall.

    Neue Meldungen werden nur fuer Officer verschluesselt, die einen
    oeffentlichen Schluessel hinterlegt haben. Wer keinen hat, bekommt
    nichts zu sehen - ohne dass irgendwo eine Fehlermeldung erschiene.
    Deshalb wird hier ausdruecklich danach gesucht.
    """
    print("\n[6] Schluessel der Bearbeiter")
    ohne = [b["fields"].get("Title") for b in bearbeiter
            if ist_wahr(b["fields"].get("Aktiv", True))
            and not b["fields"].get("PubKey")]
    if not ohne:
        print("    Alle aktiven Bearbeiter haben einen Schluessel.")
        return
    print(f"    OHNE SCHLUESSEL: {', '.join(ohne)}")
    for adresse in nur_cco(bearbeiter):
        mail(adresse,
             "Compliance Officer ohne Schluessel",
             "Folgende aktive Bearbeiter haben noch kein Schluesselpaar "
             "angelegt:\n\n  " + "\n  ".join(ohne) + "\n\n"
             "Neue Meldungen werden NICHT fuer sie verschluesselt. Sie sehen\n"
             "die Faelle in der Uebersicht, koennen aber keinen davon oeffnen.\n\n"
             f"Anlegen unter: {APP_URL}bearbeitung.html -> Mein Schluessel\n")


# ---------------------------------------------------------------------------

def main():
    print(f"DIHAG Hinweisgebersystem - Fristenwaechter, {HEUTE:%d.%m.%Y %H:%M} UTC")
    print(f"Site: {HOST}{SITEPATH}" + ("   [TROCKENLAUF]" if TROCKEN else ""))

    faelle = alle(L_FAELLE)
    bearbeiter = alle(L_BEARB)
    print(f"{len(faelle)} Fall/Faelle, {len(bearbeiter)} Bearbeiter geladen.")

    fehler = []
    for name, fn, args in (
        ("Rueckmeldefrist",      rueckmeldefrist,      (faelle, bearbeiter)),
        ("Eingangsbestaetigung", eingangsbestaetigung, (faelle, bearbeiter)),
        ("Unbearbeitet",         unbearbeitet,         (faelle, bearbeiter)),
        ("Wiedervorlagen",       wiedervorlagen,       (faelle, bearbeiter)),
        ("Loeschfristen",        loeschfristen,        (faelle,)),
        ("Schluesselpruefung",   schluessel_pruefen,   (bearbeiter,)),
    ):
        try:
            fn(*args)
        except Exception as e:                      # noqa: BLE001
            # Bewusst weiterlaufen: Faellt die Loeschung aus, duerfen die
            # Fristerinnerungen trotzdem hinausgehen. Am Ende wird mit
            # Exitcode 1 abgebrochen, damit GitHub Actions rot wird und es
            # jemand merkt.
            print(f"    FEHLER in {name}: {e}")
            fehler.append(f"{name}: {e}")

    if fehler:
        print("\nMit Fehlern beendet:")
        for f in fehler:
            print("  -", f)
        sys.exit(1)
    print("\nFertig.")


if __name__ == "__main__":
    main()
