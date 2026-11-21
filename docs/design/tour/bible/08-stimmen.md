# Stimmen: neue und geänderte Figuren (Ersatzentwurf)

> **ENTWURF für das Release nach 0.5.0.** Ergänzt `content/bible/08-stimmen.md`. **Was bleibt:** die Regeln für alle Figuren (PRD §4.4), Laub (§1, mit dem Zusatz §1.3 unten), Soll, Hanne, Jost, Peter in 1789, die historischen Personen (§7: nur belegte Worte, der Herzog nie zu sehen) und die Nebenfiguren. **Neu:** §0 Gerold Imhoff, §2 die Doppelgänger. **Geändert:** Marlene (§3, ersetzt den alten §2).
>
> **Gerold Imhoff ist ein Platzhaltername.** Die Figur ist einem echten, lebenden Führer nachempfunden; seine schriftliche Einwilligung fehlt noch. Kein echter Name, kein persönliches Detail, kein Satz, den der echte Mensch gesagt hat. Alles unten ist erfunden.

**Anrede (ergänzt).** Gerold duzt die Gruppe („ihr“) und den Spieler („du“). Die Doppelgänger duzen, Herr Soll und Carl Herzog siezen. Laub siezt (unverändert).

---

## 0. Gerold Imhoff (FIKTION, Platzhalter)

**Wer.** Führer der öffentlichen Führung. Groß, hager, kahl. Ehrenamtlich, seit vielen Jahren. Trägt einen zusammengeklappten Schirm als Zeigestock und eine Umhängetasche mit Laminatkarten. Keine Uniform, kein Abzeichen, kein Logo.

**Wie.** Ruhig, freundlich, ein wenig trocken. Er ist **genau mit Quellen**: Er sagt laut, was belegt ist, und genauso laut, was man nicht weiß. Damit ist er die Stimme der FAKT/OFFEN-Regel im Heute, so wie Laub sie in der Vergangenheit ist. Er erzählt Geschichte mit Zahlen und Vergleichen aus dem Alltag („Fünfzehn Jahre. Kürzer als so mancher Kredit.“), nie mit Spuk. An Gedenkorten (wenn er sie erwähnt) wird er leise und macht keine Witze.

**Ticks.**
- Beginnt jede Station mit „So.“ und zählt die Gruppe mit dem Schirm durch, ohne Zahlen zu sagen (die sagt Herr Soll).
- „Ehrlich: Das weiß man nicht.“ — sein Satz für alles Unbelegte. Nie „man munkelt“, nie eine erfundene Sage. Gibt es eine echte Überlieferung, sagt er „Man erzählt sich …, belegt ist das nicht“ und das Spiel markiert sie als LEGENDE.
- „Guckt mal hoch.“ — er lässt die Leute schauen, bevor er erklärt.
- Ruft Nachzügler mit Namen: „{Name}, kommst du?“ (der einzige, der neben Laub und Marlene `{Name}` benutzt; `tests/story.test.ts:212` erweitern).

**Wortschatz.** belegt, nicht belegt, Station, Leute, guckt mal, ehrlich gesagt, so.

**Tabu.** Erfindet keine Fakten. Spricht nicht über die Besitzverhältnisse des Karlsberger Hofs über „Privatbesitz“ hinaus, kein Wort über Bier oder Marken. Glaubt nicht an Geister. Erklärt dem Spieler nie das Spiel (keine Tasten), das tun die Lehrzeilen.

**Sprechhinweis.** Tief, langsam, klare Konsonanten, saarländische Färbung nur in der Melodie, keine Mundart-Schreibung.

### 0.1 Barks (`imhoff.bark.*`)

**Wartet** (Spieler > 25 m hinter der Gruppe; höchstens alle 20 s, dann geht er langsam weiter)
1. „{Name}, kommst du? Wir warten vorne.“
2. „Nicht verlaufen! Der Weg ist der mit den Leuten drauf.“
3. „Wer fotografiert, darf trödeln. Aber nicht ewig.“

**Unterwegs** (zufällig, höchstens einer pro Wegstück)
1. „Achtung, Wurzeln. Die waren auch schon da, als hier noch Kies lag. Nein, das stimmt nicht, die sind jünger.“
2. „Wer Fragen hat: fragen. Wer keine hat: auch fragen.“
3. „Hier links runter. Nein, mein anderes Links.“

**Nach Gestelltwerden, als Handy-Nachricht im Heute** (`imhoff.msg.*`)
1. „Alles gut bei dir? Wir sind noch oben.“
2. „Wir haben dir ein Stück Kuchen aufgehoben. Herr Soll hat's notiert.“
3. „Falls du dich verlaufen hast: Immer bergauf, dann kommst du an.“

---

## 1.3 Laub: Zusatz (Handy, Gruppe)

**Kein Netz** (`laub.bark.netz.*`, höchstens einmal pro Kapitel, in der Vergangenheit, wenn die Kamera geöffnet wird)
1. „Was immer das Kästchen sucht, es ist noch nicht erfunden.“
2. „Sie wollen 1789 fotografieren? 1789 möchte nicht fotografiert werden. Es hat sich nicht frisiert.“
3. „Weiß. Natürlich. Die Erinnerung hat kein Licht für Ihren Apparat.“

**Wiedererkennen** (`laub.bark.kennen.*`, einmal pro Doppelgänger-Figur, höchstens drei im Spiel)
1. „Sie schauen den Mann an, als kennten Sie ihn. Das ist unhöflich. Und interessant.“
2. „Sie haben diese Frau schon einmal gesehen. Nein, sagen Sie nichts. Ich will es nicht wissen. Doch, ich will.“
3. „Der Junge. Der Hund. Merkwürdig, wie wenig sich manche Dinge ändern.“

**Rückkehr** (ersetzt `laub.bark.return.*`, nach Q halten, jetzt an der Quelle)
1. „Wieder im November. Fünf Minuten später. Mir kam es länger vor.“
2. „Zurück an der Quelle. Schreiben Sie auf, bevor Sie vergessen.“
3. „Ihre Gesellschaft ist noch oben. Sie haben Zeit. Ich hatte nie welche.“
4. (nach Gestelltwerden) „Gestellt. Nicht gerissen. Merken Sie sich den Unterschied.“ (bleibt)

`laub.bark.lantern_low.2` „Zurück zur Station …“ → „Zurück zur Quelle wäre jetzt keine Feigheit, sondern Verwaltung.“

---

## 2. Die Doppelgänger (FIKTION)

**Regel.** Sieben Menschen in der Gruppe ähneln Figuren von 1789. Jeder hat **ein** Erkennungszeichen, leicht, liebevoll, nie spöttisch. Sie wissen nichts von 1789 und werden nie aufgeklärt. Ihre Namen sind erfunden und bewusst alltäglich; keiner steht für einen echten Menschen. Historische Personen (Herzog, Mannlich) behalten ihre Regel: Ihre **Doppelgänger** sind heutige Privatleute und sprechen frei, sie zitieren nie Mannlich und behaupten nichts über die historischen Personen.

| Heute | Beruf / Rolle | 1789 | Erkennungszeichen (Tell) | Ton |
| --- | --- | --- | --- | --- |
| **Carl Herzog** | pensionierter Autohändler, Ende sechzig, mit Schiebermütze; einziger mit Campingstuhl beim Fest | Herzog Karl II. August | will überall hinfahren („Kann man da nicht hochfahren?“, „Gibt's oben einen Parkplatz?“); hat Schnupfen (FAKT S. 422 für den Herzog 1793); liebt Hunde und fragt Jost nach jedem Detail | gutmütig, großzügig mit Worten, knauserig mit dem Kuchengeld (nie bösartig) |
| **Christian Mann** | Architekt und Freizeitmaler, Anfang fünfzig | Johann Christian von Mannlich | Skizzenbuch und eine Papprolle; zeichnet an jeder Station; korrigiert sanft Gerolds Jahreszahlen und hat fast immer unrecht | höflich, ein bisschen eitel auf seine Skizzen |
| **Hanne Matz** | Steinmetzin, Mitte dreißig, Arbeitsjacke mit Steinstaub in den Nähten | Hanne, Witwe des Steinhauers Matthes | streicht über Sandsteinkanten und sagt, wer sie gehauen hat („Das war ein Linkshänder.“); sagt Namen gern mit Buchstabierung („mit zwei T“) | gerade, trocken, warm |
| **Peter Matz** | ihr Sohn, 15, Kopfhörer | Peter (1796, Fuhrmann) | wortkarg; trägt ungefragt Hannes schwere Tasche | still, nie Witzfigur |
| **Jost Fendel** | Hundetrainer, Anfang zwanzig; zwei Hunde, **Diane** (führt) und **Bijou** (klein, hält sich für einen Hirsch) | Jost, der Hundejunge | kennt jeden Hund im Wald beim Namen; redet in Bildern („Die riechen den Regen von morgen.“); die Hunde rennen in t5 in den Wald | frech, herzlich |
| **Herr Soll** (Gerd Soll) | Steuerberater im Ruhestand | Kanzlist Gottlob Soll | zählt die Gruppe an jeder Station („… vierzehn, fünfzehn. Stimmt.“); führt die Kuchenkasse; unterscheidet „zugesagt“ und „bezahlt“ | umständlich höflich, siezt, komisch durch Ernst |
| **Liese Wendling** | Schneiderin am Stadttheater | Liese, die Wäscherin | Nähzeug in der Jackentasche; kommentiert Kleidung („Schöne Jacke. Leuchtet ja.“ — das Echo zu „Feuersalamander“); flickt beim Fest | resolut, hilfsbereit |

**Ohne Doppelgänger:** Matthes (Tabu: Tote sind kein Spiel), der Pikeur (er *ist* Jost). Marlene ist sie selbst (heute), Gerold hat keine Figur in 1789.

**Laub: kein Doppelgänger, ein Augenzwinkern.** Laub ist eine Stimme ohne Körper; ein Mensch mit seinem Gesicht würde das Geheimnis kleiner machen. Stattdessen trägt das Kind **Mats** (Extra, etwa acht) einen Spielzeugkompass und sagt am Treffpunkt: „Meiner zeigt nicht nach Norden.“ Beim Fest im Museums-Ende: „… jetzt zeigt er richtig!“ Sonst kein Wort.

**Die übrigen Mitglieder der Gruppe (Extras, ohne Namen außer Mats):** Mats und seine Mutter; ein Paar aus Zweibrücken mit gleichen Jacken; zwei Wanderinnen mit Stöcken; ein Student mit Thermoskanne. Zusammen mit dem Spieler und den sieben Doppelgängern: 15.

### 2.1 Zeilen (Auswahl, Deutsch)

| id | Wer | Wann | Text |
| --- | --- | --- | --- |
| `herzogd.t.01` | Carl Herzog | t2 | „Kann man da nicht hochfahren? Mit dem Auto, meine ich.“ |
| `herzogd.t.02` | Carl Herzog | t8 | „Jost, sagen Sie, wie viele Hunde kann ein Mensch eigentlich halten? Rein theoretisch.“ |
| `mannd.t.01` | Christian Mann | t4 | „Ich zeichne mal die Felsen. Das Schloss kann ich ja nicht zeichnen. Noch nicht.“ |
| `mannd.t.02` | Christian Mann | t7 | „Siebzehnhundertneunundsiebzig, nicht achtundsiebzig. Oder? … Nein, Sie haben recht.“ |
| `hanned.t.01` | Hanne Matz | t8 | „Guck. Das ist gehauen, nicht gewachsen. Das war ein Linkshänder.“ |
| `jostd.t.01` | Jost Fendel | t1 | „Keine Angst, die tun nix. Diane passt auf, Bijou glaubt, er wär ein Hirsch.“ |
| `jostd.t.hunde` | Jost Fendel | t5 | „Diane! Bijou! … Was habt ihr denn? Da ist doch nix.“ |
| `solld.t.01` | Herr Soll | t1, t4, t7, t9 | „… dreizehn, vierzehn, fünfzehn. Stimmt.“ (an t9 nach deinem Zurückbleiben: „… vierzehn. Einer fehlt. Ich notier's.“) |
| `liesed.t.01` | Liese Wendling | t8 | „Schöne Jacke. Leuchtet ja. Im Wald sieht man dich wenigstens.“ |

### 2.2 Barks der Gruppe (`gruppe.bark.*`, nur Heute, nur im Prolog, höchstens einer pro 40 s, nie während Gerold spricht)

1. „Ist das hier schon der Schlosspark?“ — „Das ist alles Schlosspark. War.“
2. „Hast du Empfang?“ — „Einen Strich.“
3. „Die Buchen sind ja golden. Guck mal.“
4. „Der Mann weiß aber viel.“ — „Der sagt auch, was er nicht weiß. Das find ich gut.“
5. (Mats) „Wann kommt das Schloss?“

---

## 3. Marlene (FIKTION, ersetzt den alten §2)

**Wer.** Försterin im Forstamt, Anfang fünfzig, aus der Gegend (Schwager in Rohrbach). Misst im Gelände nach, was der Laserscan von 2025 zeigt: Stativ, Messstab, Tablet, Gummistiefel. Kennt Gerold seit Jahren. Bringt keinen Funk mehr ins Spiel: Sie spricht **persönlich** (am Weiher, im Heute an wechselnden Messpunkten) oder per **Handy-Nachricht**.

**Wie.** Unverändert: herzlich, praktisch, leise saarpfälzische Färbung („Guck mal“, „gell“ höchstens einmal pro Kapitel), duzt, glaubt nicht an Geister, erklärt Werkzeuge ohne Fachjargon, sagt, woher sie etwas weiß.

**Funktion.** Werkzeug-Tutorial (Relief 1–3 aufs Handy, Messstab), Geberin der **freiwilligen** Messaufträge (`01-prolog.md` §5), Anker im Jetzt. Sie ruft am Ende deinen Namen (W7) und nimmt beim Fest ihren Stab zurück.

**Wo im Heute.** Prolog: Damm 826/−866. Danach je Kapitel ein Messpunkt auf der Route zwischen Weiher und Ehrenhof (Vorschlag: K1 Weiher, K2 Kohlplatte 1040/−902, K3 Orangerie-Fuß 1215/−955, K4 unterhalb der Ruine; alle prüfen). Sie ist ein NPC (`{npc:'marlene'}`), kein Funk-Sprecher mehr.

**Tabu.** Erfindet keine Fakten (unverändert). Sagt nie, wo man im echten Wald graben könnte.

**Portrait und Stimme.** Försterin statt Funkgerät (`dialogue/speakers.ts` `marlene`: Name „Marlene · Forstamt“, Portrait `forester`, Stimme ohne Funkfilter).

### 3.1 Allgemeine Zeilen (`marlene.gen.*`, ersetzt; bei einer Begegnung im Heute, höchstens eine)

1. „Du schon wieder! Gerold sucht dich übrigens nicht. Noch nicht.“
2. „Im Relief sieht man mehr als im Wald. Im Wald sieht man dafür, wo man hintritt.“ (bleibt)
3. „Pass auf die Gräben auf. Nicht reinfallen und nicht reingraben, das gibt Ärger mit dem Denkmalamt.“ (bleibt)
4. „Mein Schwager sagt, auf dem Karlsberg spukt's. Mein Schwager sagt auch, er kann Skat.“ (bleibt)
5. „Wenn du die alte Karte drüberlegst, verrutscht alles um ein Stück. Ich glaub, die waren damals einfach müde.“ (bleibt)
6. „Es wird früh dunkel im November. Gerold hat dir doch eine Laterne gegeben?“
7. „Die Wildschweine waren wieder am Weiher. Die graben, das dürfen die.“ (bleibt)
8. „Du warst eben ganz woanders, oder? So guckst du.“
9. „Schreib's auf, sonst vergisst du's. Hat meine Oma immer gesagt. Sie hat alles vergessen, aber aufgeschrieben.“ (bleibt)
10. „Ich mag das Licht hier um die Zeit. Da sieht der Wald aus, als würd er sich an was erinnern.“
11. „Der Laserscan ist ja neu. Zweitausendfünfundzwanzig geflogen, im Winter, ohne Laub. Sonst sieht man nix.“ (bleibt)
12. „Den Stab bringst du mir oben mit, ja? Kein Stress.“
Gestrichen: alle Zeilen mit Kaffee im Bauwagen, der Bussole in der Schublade, Nacht und Schlaf (alt 1, 2, 3, 8, 11, 15); alt 10 („Brauchst du was? Ich fahr nachher nach Homburg.“) kann als 13 bleiben.

### 3.2 Kapitelzeilen (Umbau-Hinweis)

Alle `marlene.k1–k4.*` und `marlene.end.*` werden von Funk/Bauwagen auf persönlich/Handy umgeschrieben (Liste in `../impact.md` WP-08). Muster: „Morgen, {Name}! Die Brötchen liegen auf der Stufe“ → Handy-Nachricht „Bist du noch an der Quelle? Gerold fragt, ob du Kuchen willst.“ Die Suppe (`marlene.k4.ruf` „Die Suppe wird kalt!“) → „Der Glühwein wird kalt!“, gerufen vom Weg her.
