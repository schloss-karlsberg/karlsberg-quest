# UI-Texte

Alle Texte der Oberfläche, auf Deutsch. IDs im Format `ui.<bereich>.<name>`. Platzhalter in geschweiften Klammern. Tastennamen stehen in eckigen Klammern und werden aus der Tastenbelegung ersetzt (umbelegbare Tasten, PRD §7), z. B. `[Q]`.

Stil: kurz, Feldbuch-Ton (PRD §7: „a surveyor's field book“), Sie-Form nur bei Laub; die Oberfläche spricht den Spieler mit **du** an.

---

## 1. Titel und Start

| id | Text |
| --- | --- |
| `ui.title.name` | Karlsberg Quest |
| `ui.title.subtitle` | Was das Feuer nicht fraß |
| `ui.title.tagline` | Ein Schloss, das es nicht mehr gibt. Ein Wald, der sich erinnert. Eine Jagd, die nie abgeblasen wurde. |
| `ui.start.audio` | Klicke, um die Laterne anzuzünden. |
| `ui.start.audio_hint` | (Damit startet auch der Ton.) |
| `ui.menu.new` | Neue Vermessung |
| `ui.menu.continue` | Weiter ({Kapitel}, {Datum}) |
| `ui.menu.chapters` | Kapitel wählen |
| `ui.menu.settings` | Einstellungen |
| `ui.menu.codex` | Codex |
| `ui.menu.credits` | Mitwirkende und Quellen |
| `ui.menu.ending_again` | Ende noch einmal wählen |
| `ui.menu.name_prompt` | Wie heißt du? (So nennt dich Marlene.) |
| `ui.menu.name_default` | Vermesserin / Vermesser |
| `ui.menu.mode_prompt` | Wie willst du spielen? |
| `ui.menu.mode_normal` | Normal – Die Meute jagt. Wer gestellt wird, verliert, was er in diesem Wechsel noch nicht bestätigt hat. |
| `ui.menu.mode_gentle` | Sanft – Gegner halten weniger aus, treffen schwächer und kündigen Angriffe länger an. Die Meute ist langsamer. |
| `ui.menu.mode_rauhnacht` | Rauhnacht – Die Meute ist schneller, das Öl reicht kürzer, und der Pikeur reitet früher. |
| `ui.menu.mode_note` | Du kannst den Modus jederzeit in den Einstellungen ändern. |

## 2. Inhaltshinweis (vor dem ersten Start, immer überspringbar danach)

| id | Text |
| --- | --- |
| `ui.warn.title` | Bevor du anfängst |
| `ui.warn.body` | Karlsberg Quest ist ein düsteres Action-Rollenspiel für Menschen ab 16 Jahren. Du kämpfst mit einem Messstab gegen erfundene Spukgestalten aus Nebel, Stein, Stroh und Papier und kannst dabei niedergeworfen werden. Es gibt eine unheimliche Atmosphäre, Schreckmomente, Verfolgung durch eine geisterhafte Meute, ein Feuer, in dem du dich zurechtfinden musst, und belastende Themen: Armut, unbezahlte Arbeit, ein tödlicher Unfall (1785), Plünderung und Zerstörung. Es gibt kein Blut und keine Gewalt gegen Menschen; was Menschen einander angetan haben, wird angedeutet, nicht gezeigt. |
| `ui.warn.fiction` | Das Spiel erzählt von echten Orten und echten Ereignissen. Was belegt ist, steht mit Quelle im Codex. Was erfunden ist, ist als „Fiktion“ gekennzeichnet. |
| `ui.warn.real_place` | Der Karlsberg bei Homburg ist ein geschütztes Bodendenkmal. Schauen, nicht graben. Dieses Spiel zeigt keine Fundstellen und gibt keine Grabtipps. |
| `ui.warn.gentle` | Wenn dir Kämpfe oder Jagd zu viel werden: Der sanfte Modus nimmt den Druck heraus. |
| `ui.warn.ok` | Verstanden |

## 3. Steuerung (Hilfe-Seite und erste Einblendungen)

| id | Taste | Text |
| --- | --- | --- |
| `ui.keys.move` | [W][A][S][D] | Gehen |
| `ui.keys.run` | [Shift] | Rennen (laut) |
| `ui.keys.sneak` | [C] | Schleichen (leise, langsam) |
| `ui.keys.prone` | [X] | Hinlegen / Aufstehen. Wer flach liegt, wird von der Meute kaum gesehen und nicht gehört. |
| `ui.keys.spirit` | [F] | Geisterblick: freier Flug über das Land (nur im Heute) |
| `ui.keys.scan` | [1] [2] [3] | Relief-Blick: Schummerung / Lokales Relief / VAT |
| `ui.keys.map` | [M] | Karte vergleichen: 1840 oder 1935 über das Gelände legen |
| `ui.keys.listen` | [E] halten | Lauschen: Erinnerungen an diesem Ort hören |
| `ui.keys.examine` | Klick | Untersuchen |
| `ui.keys.shift` | [Q] | Zeitwechsel an einem Ankerpunkt. [Q] 3 s halten: zurück zur Feldstation (nicht, solange die Meute dich sieht) |
| `ui.keys.lantern` | [L] | Laterne an / aus. Licht hilft beim Lesen, aber es lockt die Meute. |
| `ui.keys.chronik` | [Tab] | Chronik öffnen |
| `ui.keys.measure` | [R] | Messen: Strecke und Höhenprofil (ab Kapitel 2) |
| `ui.keys.pause` | [Esc] | Pause |

## 4. Tutorial-Einblendungen (Prolog)

Jede Einblendung erscheint einmal, unten mittig, bis die Aktion ausgeführt ist.

| id | Auslöser | Text |
| --- | --- | --- |
| `ui.tut.move` | Start | Gehe mit [W][A][S][D]. Schau mit der Maus. |
| `ui.tut.examine` | erster Gegenstand in Reichweite | Klicke, um etwas zu untersuchen. |
| `ui.tut.scan1` | vor dem Bauwagen | Drücke [1]: Relief-Blick. So sieht der Boden ohne Wald aus. |
| `ui.tut.scan2` | am Damm | Drücke [2]: Lokales Relief. Kleine Kanten werden sichtbar. |
| `ui.tut.scan3` | an der Orangerie | Drücke [3]: VAT. Kanten, Gruben und Rinnen auf einmal. |
| `ui.tut.spirit` | Feldstation, nach dem Damm | Drücke [F] für den Geisterblick und fliege zum Ehrenhof. [F] erneut: landen. |
| `ui.tut.map` | Ehrenhof | Drücke [M]: Lege die Karte von 1840 über das Gelände. Merkst du den Versatz? |
| `ui.tut.chronik` | erstes Substantiv gefunden | Neues Wort für die Chronik. Öffne sie mit [Tab]. |
| `ui.tut.fill` | Chronik offen | Ziehe ein Wort in eine Lücke. Drei richtige Sätze werden zusammen bestätigt. |
| `ui.tut.shift` | Anker erreicht, 1. Satz bestätigt | Hier erinnert sich das Land. Drücke [Q], um die Zeit zu wechseln. |
| `ui.tut.return` | erster Wechsel, nach 60 s | Halte [Q] 3 Sekunden, um zur Feldstation zurückzukehren. |
| `ui.tut.listen` | erstes Echo in Reichweite | Halte [E], um zu lauschen. |
| `ui.tut.lantern` | erste Dämmerung | [L]: Laterne. Das Öl reicht nicht ewig. |
| `ui.tut.sneak` | Kapitel 1, Jost | [C]: Schleichen. [X]: Hinlegen. Wasser, Hohlwege und große Steine verbergen dich. |
| `ui.tut.measure` | Kartograf 3 frei | [R]: Messen. Klicke Anfang und Ende. |

## 5. HUD

| id | Text |
| --- | --- |
| `ui.hud.era.heute` | Heute · November |
| `ui.hud.era.1785` | 19. Dezember 1785 · Erinnerung |
| `ui.hud.era.1789` | Sommer 1789 |
| `ui.hud.era.1793_02` | Nacht zum 10. Februar 1793 |
| `ui.hud.era.1793_07` | 28. Juli 1793 |
| `ui.hud.era.1796` | 1796 |
| `ui.hud.era.1840` | November 1840 · Erinnerung |
| `ui.hud.echo_badge` | Erinnerung (Fiktion) |
| `ui.hud.quote_badge` | Zitat: {Quelle}, S. {Seite} |
| `ui.hud.oil` | Öl |
| `ui.hud.smoke` | Rauch |
| `ui.hud.forget` | Vergessen |
| `ui.hud.anchor` | Ankerpunkt · [Q] Zeitwechsel |
| `ui.hud.anchor_locked` | Ankerpunkt · noch verschlossen |
| `ui.hud.return_hold` | Zurück zur Feldstation … |
| `ui.hud.return_blocked` | Nicht jetzt. Die Meute sieht dich. |
| `ui.hud.new_noun` | Neues Wort: {Wort} |
| `ui.hud.new_codex` | Codex: {Titel} |
| `ui.hud.relief_found` | Reliefmuster erkannt: {Name} |
| `ui.hud.stone_found` | Wandernde Steine {n}/4 |
| `ui.hud.private` | Privatgrund. Nur von der Straße aus ansehen. |
| `ui.hud.oob` | Weiter geht die Vermessung nicht. |

## 6. Hornrufe (Untertitel; ohne/mit Spurenleser 1)

| id | ohne Spurenleser 1 | mit Spurenleser 1 |
| --- | --- | --- |
| `ui.horn.anblasen` | [Horn: ein langer Ton] | [Horn: ein langer Ton – die Jagd beginnt] |
| `ui.horn.faehrte` | [Horn: zwei kurze Töne] | [Horn: zwei kurze Töne – sie haben deine Fährte] |
| `ui.horn.verloren` | [Horn: ein fallender Ton] | [Horn: ein fallender Ton – sie haben dich verloren und suchen, wo du warst] |
| `ui.horn.sammeln` | [Horn: drei lange Töne] | [Horn: drei lange Töne – sie sammeln sich] |
| `ui.sound.hounds` | [Hecheln, nah] / [Pfoten im Raureif] / [Bellen, fern] | Richtungspfeil am Bildrand (Barrierefreiheit) |
| `ui.sound.pikeur` | [Hufschlag] | Richtungspfeil am Bildrand |

## 7. Gestellt, zurückgeworfen, heimgebracht

| id | Text |
| --- | --- |
| `ui.caught.title` | Die Meute hat dich gestellt … |
| `ui.caught.body` | Du wachst in der Feldstation auf. Der Kaffee ist kalt. |
| `ui.caught.lost` | Verloren aus diesem Wechsel: {Liste der Wörter} |
| `ui.caught.lost_none` | Du hast nichts verloren. |
| `ui.caught.kept` | Bestätigte Einträge bleiben. |
| `ui.smoke.title` | Der Rauch hat dich zurückgeworfen … |
| `ui.smoke.body` | Du wachst in der Feldstation auf und riechst nach Brand. |
| `ui.forget.title` | Das Vergessen hat dich eingeholt … |
| `ui.forget.body` | Jemand ruft deinen Namen. Du wachst in der Feldstation auf. |
| `ui.homed.title` | Die Meute hat dich heimgebracht … |
| `ui.homed.body` | Nichts verloren. Nur zurückgebracht. |
| `ui.oil.title` | Die Laterne ist erloschen … |
| `ui.oil.body` | Im Dunkeln findet dich die Bussole zurück. Du wachst in der Feldstation auf. |
| `ui.retry` | Weiter |

## 8. Chronik

| id | Text |
| --- | --- |
| `ui.chronik.title` | Chronik |
| `ui.chronik.subtitle` | Was der Hof schuldig blieb |
| `ui.chronik.page` | Seite {n}: {Kapiteltitel} |
| `ui.chronik.words` | Gefundene Wörter |
| `ui.chronik.filter_all` | Alle |
| `ui.chronik.cat.wer` | Wer |
| `ui.chronik.cat.was` | Was |
| `ui.chronik.cat.wo` | Wo |
| `ui.chronik.cat.wann` | Wann |
| `ui.chronik.cat.wieviel` | Wie viel |
| `ui.chronik.cat.wielange` | Wie lange |
| `ui.chronik.cat.wie` | Wie |
| `ui.chronik.cat.warum` | Warum |
| `ui.chronik.label.fakt` | Tatsache |
| `ui.chronik.label.lesart` | Lesart |
| `ui.chronik.label.gedenk` | Gedenkzeile |
| `ui.chronik.fact_hint` | Tatsachen werden in Dreiergruppen bestätigt. |
| `ui.chronik.reading_hint` | Lesarten werden nie bestätigt. Du entscheidest. Der Epilog erinnert sich daran. |
| `ui.chronik.confirm_where` | Bestätigen kannst du nur in der Feldstation. |
| `ui.chronik.status_open` | offen |
| `ui.chronik.status_filled` | ausgefüllt |
| `ui.chronik.status_confirmed` | bestätigt |
| `ui.chronik.status_correct_gentle` | richtig (sanfter Modus) |
| `ui.chronik.batch_ok` | Bestätigt: drei Einträge stimmen. |
| `ui.chronik.batch_fail` | Drei Einträge stehen, aber nicht alle stimmen. |
| `ui.chronik.unlock` | Freigeschaltet: {Name} |
| `ui.chronik.leave_empty` | Leer lassen |
| `ui.chronik.reading_set` | Deine Lesart ist notiert. |
| `ui.chronik.complete` | Chronik vollständig: {p} % |
| `ui.chronik.codex_link` | Im Codex lesen |

## 9. Codex

| id | Text |
| --- | --- |
| `ui.codex.title` | Codex |
| `ui.codex.tab_cards` | Karten |
| `ui.codex.tab_relief` | Reliefmuster |
| `ui.codex.sources` | Quellen |
| `ui.codex.confidence` | Sicherheit |
| `ui.codex.conf.D` | D – belegt |
| `ui.codex.conf.I` | I – erschlossen |
| `ui.codex.conf.N` | N – üblich für die Zeit |
| `ui.codex.conf.U` | U – unbekannt |
| `ui.codex.label.FAKT` | Tatsache |
| `ui.codex.label.STRITTIG` | Strittig |
| `ui.codex.label.LEGENDE` | Legende |
| `ui.codex.label.FIKTION` | Fiktion |
| `ui.codex.contested` | Hier widersprechen sich die Quellen: |
| `ui.codex.locked` | Noch nicht gefunden. |
| `ui.codex.licence` | Lizenz |

## 10. Pause und Einstellungen

| id | Text |
| --- | --- |
| `ui.pause.title` | Pause |
| `ui.pause.resume` | Weiter |
| `ui.pause.chronik` | Chronik |
| `ui.pause.codex` | Codex |
| `ui.pause.settings` | Einstellungen |
| `ui.pause.help` | Steuerung |
| `ui.pause.station` | Zur Feldstation (nur, wenn dich niemand sieht) |
| `ui.pause.menu` | Hauptmenü |
| `ui.pause.saved` | Gespeichert: {Uhrzeit} |
| `ui.set.title` | Einstellungen |
| `ui.set.mode` | Spielmodus: Normal / Sanft / Rauhnacht |
| `ui.set.volume_master` | Lautstärke gesamt |
| `ui.set.volume_voice` | Stimmen |
| `ui.set.volume_ambience` | Umgebung |
| `ui.set.subtitles` | Untertitel |
| `ui.set.subtitle_size` | Größe der Untertitel |
| `ui.set.sound_indicators` | Geräusche anzeigen (Richtungspfeile für Hunde, Horn, Hufschlag) |
| `ui.set.colorblind` | Farbschema der Zeiten (farbenblind-sicher) |
| `ui.set.reduced_motion` | Weniger Bewegung (keine Kamerawackler, sanfte Übergänge) |
| `ui.set.flash` | Grelle Blitze abschwächen (Feuerwerk, Feuer) |
| `ui.set.fov` | Sichtfeld |
| `ui.set.mouse` | Mausempfindlichkeit |
| `ui.set.invert` | Maus Y umkehren |
| `ui.set.keys` | Tasten belegen |
| `ui.set.one_key` | Eine Taste für Aktionen (z. B. Hinlegen schaltet die Laterne mit) |
| `ui.set.hold_toggle` | Halten statt Drücken umschalten ([E], [Q]) |
| `ui.set.quality` | Grafikqualität: Niedrig / Mittel / Hoch |
| `ui.set.hint_timer` | Hinweise von Laub: Normal / Früher / Aus |
| `ui.set.reset` | Spielstand löschen |
| `ui.set.reset_confirm` | Wirklich? Die Chronik ist danach leer. |
| `ui.set.saved` | Einstellungen gespeichert. |

## 11. Wahl des Endes

| id | Text |
| --- | --- |
| `ui.end.prompt` | Was wird aus der Chronik? |
| `ui.end.museum` | Ins Museum geben |
| `ui.end.museum_sub` | Die Wahrheit, mit Quellen. Die Jagd wird abgeblasen. |
| `ui.end.burn` | Verbrennen |
| `ui.end.burn_sub` | Ruhe für die Hunde. Stille für die Stimmen. |
| `ui.end.keep` | Behalten |
| `ui.end.keep_sub` | Das Land erinnert sich weiter. Die Meute folgt dir. |
| `ui.end.confirm` | Bist du sicher? Das lässt sich nicht ändern. |
| `ui.end.empty_readings` | Du hast {n} Lesarten offen gelassen. Willst du sie noch füllen? |
| `ui.end.fill` | Noch füllen |
| `ui.end.leave` | So lassen |

## 12. Ladetipps

Zufällig beim Laden. Keine Lösungen, keine echten Fundstellen.

1. Wer flach liegt, wird gesehen, aber nicht gehört. Wer rennt, wird gehört, auch wenn er nicht gesehen wird.
2. Fließendes Wasser bricht jede Fährte.
3. Im Hohlweg steht die Luft still. Hunde riechen dort schlechter.
4. Deine Laterne ist für die Meute wie eine Glocke.
5. Drei Einträge, die stimmen, werden zusammen bestätigt. Rate nicht, prüfe.
6. Ein Wort kann in mehreren Kapiteln vorkommen, als Antwort und als Falle.
7. Lesarten werden nie bestätigt. Es gibt keine falsche Lesart.
8. Bestätigen kannst du nur im Heute, in der Feldstation.
9. Gerade Linien und rechte Winkel macht der Wald nicht.
10. Ein Graben in der Form einer Mauer ist oft das Loch, in dem eine Mauer war.
11. Die Karte von 1840 liegt rund 50 Meter daneben. Laub sagt, das liegt nicht an ihm.
12. Erinnerungen sind keine Rekonstruktion. Was belegt ist, steht im Codex.
13. Historische Personen sagen im Spiel nur, was überliefert ist.
14. Der Karlsberg ist ein Bodendenkmal. Schauen, nicht graben.
15. Im Feuerschein sieht keiner deine Laterne. Aber jeder hört deine Schritte.
16. Wenn dir alles zu viel wird: Der sanfte Modus ist kein Versagen.
17. Mannlich hat Jahre später geschrieben. Wer zeitnah schrieb, irrte sich seltener im Datum.
18. Gestellt ist nicht gerissen.
19. In 1789 gibt es keinen Wald auf dem Berg. Den hat man erst später gepflanzt.
20. Q 3 Sekunden halten bringt dich heim, solange dich niemand sieht.

## 13. Mitwirkende, Quellen und Lizenzen (Abspann und Menüseite)

**Aufbau des Abspanns:**

1. **Karlsberg Quest** – ein Spiel über einen Ort, den es nicht mehr gibt.
2. Idee, Entwicklung: {Team}
3. Geschichte und Texte: {Team}
4. Historische Beratung: {offen, PRD M5 „historian review“}
5. **In Erinnerung an** die Arbeiter am Karlsberg, deren Namen nicht überliefert sind, und an Major Magnier und seine Leute, Dezember 1785.
6. **Quellen** (Auswahl, alle im Codex mit Link):
   - Johann Christian von Mannlich, *Ein deutscher Maler und Hofmann. Lebenserinnerungen 1741–1822*, hg. Eugen Stollreither, Berlin 1910 (archive.org)
   - Jutta Schwan, „Schloss Carlsberg bei Homburg-Saar“, *Burgen und Schlösser* 4/2012
   - Allgemeine Deutsche Biographie; Wikipedia (de, en)
   - Stadt Homburg, Saarpfalz-Touristik, urlaub.saarland, schloss-karlsberg.de
   - Rosa-Luxemburg-Stiftung (2015), Die Rheinpfalz (2018), Historisches Museum Saar (Steinerne Macht)
   - Universitäts- und Landesbibliothek Darmstadt (Festpläne 1785, CC0)
7. **Daten:**
   - Geländemodell DGM1 2025, Laserscan, historische Karten (Bayerische Originalpositionsblätter 1836–41, TK25 1935–40): © GeoBasis-DE/LVGL-SL ({Jahr}), Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0)
   - Geländemodell DGM1 2022 (Grenzbereich): © GeoBasis-DE/LVermGeoRP ({Jahr}), dl-de/by-2-0
   - Wege, Gewässer, Mauern: © OpenStreetMap-Mitwirkende, ODbL
   - Rekonstruktion 1789 (Hypothese): Modell und Katalog aus dem Projekt „saar-lidar-explorer / schloss-karlsberg“ (nur gelesen, nicht verändert)
8. **Was erfunden ist:** Laub, Marlene, Soll, Hanne, Matthes, Peter, Jost, die Hunde, die Chronik, die Meute, der Steinfraß. Siehe Codex „Was in diesem Spiel erfunden ist“.
9. **Schauen, nicht graben.** Der Karlsberg ist ein Bodendenkmal. Funde gehören gemeldet, nicht mitgenommen.
10. Danke an alle, die den Karlsberg pflegen, erforschen und erklären.

Engineers: Die genauen Attributionstexte für Daten kommen aus den `manifest.json`-Dateien der Datenaufbereitung (so hält es auch das Schwesterprojekt). Die Liste oben ist die Mindestfassung.

## 14. Sonstiges

| id | Text |
| --- | --- |
| `ui.err.webgl` | Dein Browser kann kein WebGL 2. Karlsberg Quest braucht es für das Gelände. Versuch es mit einem aktuellen Chrome, Firefox oder Safari. |
| `ui.err.load` | Ein Teil des Geländes ließ sich nicht laden. Bitte lade die Seite neu. |
| `ui.err.save` | Speichern ging nicht (privater Modus?). Dein Fortschritt geht beim Schließen verloren. |
| `ui.save.auto` | Gespeichert. |
| `ui.loading` | Vermesse … |
| `ui.loading.era` | Das Land erinnert sich … |
| `ui.mobile` | Karlsberg Quest ist für Tastatur und Maus gemacht. Eine Touch-Steuerung kommt später. |
