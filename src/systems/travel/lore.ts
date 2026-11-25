/**
 * Fundstücke along the routes: letters, notes, tokens that someone dropped. All of them are fiction
 * (marked so in the game), written around what the sources tell (the palace built from 1778 for
 * Duke Karl II. August, Mannlich as building director, the kennels and the menagerie, the duke's
 * flight in February 1793, the fire of 28 July 1793, the ruin as a quarry afterwards). Nobody asks
 * anything about them: you find one, you read it, and it appears under Funde.
 */

export type LoreKind = 'brief' | 'zettel' | 'marke' | 'muenze';

export interface LoreEntry {
  id: string;
  /** Era in which the piece lies on the ground. */
  era: 'today' | '1789' | '1793-02' | '1793-07' | '1796';
  kind: LoreKind;
  title: string;
  /** Who wrote it / what it is. */
  from: string;
  text: string;
}

export const LORE: readonly LoreEntry[] = [
  // ---- today: what the land still holds -----------------------------------------------------
  { id: 'lore.heute.flasche', era: 'today', kind: 'zettel', title: 'Ein Etikett im Laub', from: 'Wanderer, ohne Jahr', text: 'Auf der Rückseite eines Etiketts, mit Bleistift: „Hier soll ein Schloss gestanden haben, größer als Versailles. Ich sehe Buchen.“ Darunter, in anderer Schrift: „Dann schau tiefer.“' },
  { id: 'lore.heute.grenzstein', era: 'today', kind: 'marke', title: 'Ein Bolzen im Stein', from: 'Vermessungsmarke', text: 'Ein Messingbolzen, in einen Sandsteinbrocken gesetzt. Jemand hat den Brocken als Grenzstein benutzt. Der Stein ist älter als die Grenze: Er hat eine Kante, die ein Steinmetz gehauen hat, für eine Wand, die es nicht mehr gibt.' },
  { id: 'lore.heute.marlene', era: 'today', kind: 'zettel', title: 'Marlenes Notiz', from: 'Marlene, lose Seite', text: '„Punkt 14 versetzt, Wurzelteller. Die Kante im Gelände läuft weiter als die Karte. Laub sagt, das ist die Gartenmauer. Laub sagt viel.“' },
  { id: 'lore.heute.scherbe', era: 'today', kind: 'muenze', title: 'Eine grüne Scherbe', from: 'Glas, 18. Jahrhundert (Fiktion)', text: 'Grünes Glas, blasig, mit einer Spur Gold am Rand. Ein Becher aus der Hofkellerei vielleicht. Er ist nicht im Feuer zersprungen, er ist später unter einem Karrenrad gebrochen.' },
  { id: 'lore.heute.wurzel', era: 'today', kind: 'zettel', title: 'Unter der Buche', from: 'Forstkarte, Randnotiz', text: '„Im Windwurf: Ziegel, gebrannter Kalk, ein Stück Fensterblei. Liegen lassen. Melden.“ Niemand hat es gemeldet. Die Buche ist wieder gerade gewachsen.' },
  // ---- 1789: the court at its height ----------------------------------------------------------
  { id: 'lore.1789.kerzen', era: '1789', kind: 'zettel', title: 'Kerzenzettel', from: 'Lakai im Corps de logis', text: '„Für den Festsaal: Wachs, nicht Talg. Für die Gänge Talg. Für die Kammern der Dienerschaft: was übrig bleibt.“ Die Zahl darunter ist so groß, dass jemand sie zweimal nachgezogen hat.' },
  { id: 'lore.1789.hundeliste', era: '1789', kind: 'zettel', title: 'Eine Futterliste', from: 'Zwinger, Jägerei', text: 'Brot, Hafer, Fleisch vom Abdecker, in Zentnern. Am Rand Namen: „Diana, Hektor, Mylord, Fanfare“, dann hört der Schreiber auf und schreibt nur noch Striche. Sehr viele Striche.' },
  { id: 'lore.1789.lohn', era: '1789', kind: 'brief', title: 'Ein Brief an die Rentkammer', from: 'Ein Maurer, unterzeichnet mit einem Zeichen', text: '„Bitte untertänigst um den Lohn von elf Wochen. Meine Frau sagt, man kann keinen Schlossbau essen.“ Darunter ein Winkel und drei Punkte statt eines Namens.' },
  { id: 'lore.1789.mannlich', era: '1789', kind: 'zettel', title: 'Eine Bauskizze', from: 'Bauamt, Kopie (Fiktion)', text: 'Ein Pavillon, schnell gezeichnet, mit einer Notiz: „Serenissimus wünscht es bis zum Herbst.“ Darunter, kleiner: „Welchen Herbst?“ Das Bauamt hat den Zettel nicht abgeheftet.' },
  { id: 'lore.1789.kasuar', era: '1789', kind: 'zettel', title: 'Fütterung, Menagerie', from: 'Wärter der Karlslust', text: '„Der Kasuar frisst Obst und schlägt nach dem, der es bringt. Nicht von vorn füttern. Nie von vorn.“ Der Zettel hat ein Loch, das wie ein Schnabel aussieht.' },
  { id: 'lore.1789.apfel', era: '1789', kind: 'brief', title: 'Vom Obstgarten', from: 'Ein Gärtnerbursche an seine Mutter', text: '„Wir setzen Apfelbäume an die Allee, in Reihen, schnurgerade. Ich darf die Löcher graben, sonst nichts. Wenn ich alt bin, sag ich: Die Allee, die hab ich gegraben.“' },
  { id: 'lore.1789.marke', era: '1789', kind: 'marke', title: 'Ein Livreeknopf', from: 'Messing, mit Wappen', text: 'Ein Messingknopf von einer Livree. Das Wappen ist sauber, die Öse ist abgerissen. Wer ihn verloren hat, hat dafür vermutlich bezahlt.' },
  // ---- 1793-02: the night of the flight -------------------------------------------------------
  { id: 'lore.179302.packliste', era: '1793-02', kind: 'zettel', title: 'Eine Packliste', from: 'Kammer, Februar 1793', text: '„Silber zuerst. Bilder, die kleinen. Die großen bleiben, man kann nicht alles —“ Der Satz hört auf. Die Tinte ist im Frost gesprungen.' },
  { id: 'lore.179302.wache', era: '1793-02', kind: 'zettel', title: 'Wachzettel', from: 'Nordwache', text: '„Nachts zwei Laternen am Weg. Wer kommt: Name, Ort, wohin. Wer geht: nicht fragen.“ Das „nicht fragen“ ist später dazugeschrieben worden.' },
  { id: 'lore.179302.handschuh', era: '1793-02', kind: 'marke', title: 'Ein Handschuh im Schnee', from: 'Wolle, Kinderhand', text: 'Ein gestrickter Handschuh, zu klein für einen Kutscher. Er liegt auf der Spur, nicht daneben. Wer ihn verloren hat, ist nicht zurückgegangen.' },
  { id: 'lore.179302.kutscher', era: '1793-02', kind: 'brief', title: 'Ein Kutscher schreibt', from: 'An seinen Bruder in Zweibrücken', text: '„Wir fahren in der Nacht. Wohin, sagt keiner, nur: schnell. Die Pferde sind nicht beschlagen für Eis. Bete für die Pferde, für uns betet schon der Herr Hofprediger.“' },
  { id: 'lore.179302.apfelallee', era: '1793-02', kind: 'zettel', title: 'Unter den Apfelbäumen', from: 'Ein Bauer (Fiktion)', text: '„Schnee bis ans Knie. Die Allee hinauf, weil man zwischen den Bäumen den Weg nicht verliert. Oben brennt Licht in allen Fenstern. Da schläft heute keiner.“' },
  // ---- 1793-07: the fire ----------------------------------------------------------------------
  { id: 'lore.179307.quittung', era: '1793-07', kind: 'zettel', title: 'Eine Quittung', from: 'Ohne Siegel', text: '„Empfangen: ein Spiegel, ein Stuhl, zwei Vorhänge.“ Kein Preis, kein Name. Wer im Juli 1793 hier quittiert hat, wollte sich vor allem selbst glauben.' },
  { id: 'lore.179307.vorhang', era: '1793-07', kind: 'marke', title: 'Eine Goldfranse', from: 'Von einem Lehnstuhl', text: 'Eine Handbreit Goldfranse, an einem Ende angesengt. Sie war an einem Stuhl, der jetzt irgendwo in einer Bauernstube steht. Oder im Ofen.' },
  { id: 'lore.179307.soldat', era: '1793-07', kind: 'brief', title: 'Ein Soldat schreibt', from: 'Feldpost, französisch, übersetzt (Fiktion)', text: '„Wir haben den Befehl. Ich habe noch nie so viele Fenster gesehen. Man sagt, hinter jedem war ein Zimmer. Morgen sind es keine Zimmer mehr.“' },
  { id: 'lore.179307.eimer', era: '1793-07', kind: 'marke', title: 'Ein Löscheimer', from: 'Leder, gestempelt', text: 'Ein lederner Feuereimer mit dem Stempel des Hofes. Er ist leer und hat ein Loch. Irgendwer hat es trotzdem versucht.' },
  { id: 'lore.179307.dorf', era: '1793-07', kind: 'zettel', title: 'Aus den Dörfern', from: 'Notiz auf einem Sack', text: '„Fünf Jahre Fron, kein Lohn. Heute hole ich mir meinen.“ Der Sack ist leer. Vielleicht kam er zu spät, vielleicht hat er es sich anders überlegt.' },
  // ---- 1796: the quarry -----------------------------------------------------------------------
  { id: 'lore.1796.fuhrlohn', era: '1796', kind: 'zettel', title: 'Fuhrlohn', from: 'Ein Fuhrmann aus Homburg', text: '„Drei Fuhren Quader, behauen, zur Stadt. Gezahlt nach Gewicht.“ Die Steine wiegen gleich, ob sie aus einem Palast kommen oder aus einem Bruch. Nur der Fuhrmann weiß es.' },
  { id: 'lore.1796.tuersturz', era: '1796', kind: 'marke', title: 'Ein Türsturz', from: 'Sandstein mit Profil', text: 'Ein Stück Türsturz mit einem feinen Profil. Er liegt beim Haufen für die Mauern, nicht beim Haufen für die Häuser. Profile will keiner haben, die kosten Platz.' },
  { id: 'lore.1796.kind', era: '1796', kind: 'zettel', title: 'Eine Kinderzeichnung', from: 'Kohle auf Brettchen', text: 'Ein Haus mit sehr vielen Fenstern, mit Kohle auf ein Brettchen gemalt. Daneben ein kleines Haus mit einem. Darunter: „unser“. Mit einem Pfeil auf das kleine.' },
  { id: 'lore.1796.pacht', era: '1796', kind: 'brief', title: 'Eine Bitte um Pacht', from: 'An die Verwaltung', text: '„Bitte, den Platz am Baumagazin pachten zu dürfen, für Steine und Holz. Es liegt doch alles nur herum.“ Am Rand, fremde Hand: „Eben.“' },
];

export function loreById(id: string): LoreEntry | undefined {
  return LORE.find((l) => l.id === id);
}

export const LORE_KIND_DE: Record<LoreKind, string> = { brief: 'Brief', zettel: 'Zettel', marke: 'Fundstück', muenze: 'Fundstück' };
