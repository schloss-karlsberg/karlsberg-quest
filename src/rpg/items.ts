/**
 * Core items, loot tables and collection sets (docs/ACTION-RPG.md §7). Pure data — the
 * progression track owns the numbers; item ids are a CONTRACT (only add, never rename).
 *
 * Chapter-specific quest items and lore pages are declared in the quest files themselves
 * (`content/quests/*.quests.json` → `items`), ids `item.<chapter>.<name>`.
 * There is no currency (PRD: no shop, no grind); loot is consumables and lore.
 */
import type { CollectionSet, ItemDef, LootTable } from './types';

export const ITEMS: readonly ItemDef[] = [
  // ---- the surveyor's ranging pole: one weapon, upgraded by quests -----------------------
  { id: 'item.stab.esche', kind: 'weapon', name_de: 'Messstab', text_de: 'Ein eschener Fluchtstab, rot-weiß gestrichen, mit Eisenschuh. Zum Messen gebaut. Hält mehr aus, als das Forstamt denkt.', effect: { damage: 12, spectral: 1 } },
  { id: 'item.stab.eisen', kind: 'weapon', name_de: 'Messstab mit Eisenbeschlag', text_de: 'Hanne hat den Schuh neu beschlagen lassen, mit einem Nagel aus dem Bauplatz. „Matthes hätte es so gemacht.“', effect: { damage: 16, spectral: 1 } },
  { id: 'item.stab.silber', kind: 'weapon', name_de: 'Messstab mit Silberdraht', text_de: 'Um den Griff gewickelter Silberdraht aus einer Laternenfassung. Nebel mag ihn nicht.', effect: { damage: 19, spectral: 1.15 } },
  { id: 'item.stab.bann', kind: 'weapon', name_de: 'Messstab mit Bannkerben', text_de: 'Neun Kerben, in der Nacht des Brandes eingeschnitten, eine für jede Stunde. Laub nennt es „unwissenschaftlich, aber wirksam“.', effect: { damage: 23, spectral: 1.2 } },
  { id: 'item.stab.lot', kind: 'weapon', name_de: 'Messstab mit Laubs Lot', text_de: 'Am Kopf hängt an einer Kette das Senklot aus Laubs Theodolitkoffer. Ein Wuchthieb zieht es im Kreis.', effect: { damage: 26, spectral: 1.25, sweep: true } },

  // ---- charms (1 slot, 2 from level 6) -----------------------------------------------------
  { id: 'item.charm.rechenpfennig', kind: 'charm', name_de: 'Solls Rechenpfennig', text_de: 'Ein Messingpfennig vom Rechenbrett der Registratur. „Ausgezahlt“, sagt Soll, „im übertragenen Sinn.“', effect: { mods: { loot: 0.1 } } },
  { id: 'item.charm.hundemarke', kind: 'charm', name_de: 'Josts Hundemarke', text_de: 'Eine Blechmarke ohne Namen. Jost: „Für den Hund, den keiner gezählt hat.“ Streuner zögern, bevor sie springen.', effect: { mods: { damageTaken: 0.92 } } },
  { id: 'item.charm.tuergriff', kind: 'charm', name_de: 'Der Türgriff', text_de: 'Messing, vom Festsaal. Matthes hat die Wand drumherum gemacht. Wer ihn trägt, schlägt fester zu.', effect: { mods: { stagger: 1.25 } } },
  { id: 'item.charm.dukat', kind: 'charm', name_de: 'Der Dukat', text_de: 'Ein Dukat mit dem Bild des Schlosses. Das Schloss gibt es nicht mehr, den Dukaten schon.', effect: { mods: { xp: 1.1 } } },
  { id: 'item.charm.uhr', kind: 'charm', name_de: 'Die Uhr', text_de: 'Vergoldet, Alabaster, sie tickt noch. Das Bannlicht lädt sich im Takt schneller nach.', effect: { mods: { bannRecharge: 0.8 } } },
  { id: 'item.charm.winkel', kind: 'charm', name_de: 'Matthes’ Zeichen', text_de: 'Ein Kiesel mit eingeritztem Winkel und drei Punkten. Peter hat ihn dir gegeben. Atem reicht länger.', effect: { mods: { staminaCost: 0.85 } } },
  { id: 'item.charm.feder', kind: 'charm', name_de: 'Kasuarfeder', text_de: 'Schwarz, struppig, nicht schön. Der Kasuar hat sie freiwillig hergegeben, glaubt man. Ausweichen kostet weniger.', effect: { mods: { staminaCost: 0.9 } } },

  // ---- consumables (quick-use H; field-book names) -----------------------------------------
  { id: 'item.balsam', kind: 'consumable', name_de: 'Kräuterbalsam', text_de: 'Arnika und Ringelblume in Schmalz. Riecht nach Großmutter. Heilt.', stack: 9, effect: { heal: 45 } },
  { id: 'item.riechsalz', kind: 'consumable', name_de: 'Riechsalz', text_de: 'Hirschhornsalz im Fläschchen. Einmal daran, und der Atem ist wieder da.', stack: 5, effect: { stamina: 100 } },
  { id: 'item.lampenoel', kind: 'consumable', name_de: 'Lampenöl', text_de: 'Rüböl für die Laterne. Füllt das Bannlicht auf.', stack: 5, effect: { bann: 2, oil: 0.5 } },
  { id: 'item.kalkstaub', kind: 'consumable', name_de: 'Kalkstaub', text_de: 'Eine Handvoll gebrannter Kalk aus dem Ofen am Hang. Geworfen, hält er Geister für einen Atemzug fest. „Das sind Kalköfen“, sagt Laub.', stack: 5, effect: { burst: 6 } },

  // ---- the hunting horn (finale) -------------------------------------------------------
  { id: 'item.horn', kind: 'key', name_de: 'Das Horn', text_de: 'Josts Horn, das Mundstück zuerst gereicht. Kalt und echt.' },
];

/**
 * Each entry rolls independently: chance + the player's `loot` stat + bad-luck protection (every
 * empty roll in a row adds +6 %, at most +30 %; src/systems/progression/logic.ts). Tuned
 * 2026-11-15 (docs/ACTION-RPG.md §7): a small enemy drops something about every third kill.
 */
export const LOOT: readonly LootTable[] = [
  { id: 'loot.klein', entries: [{ item: 'item.balsam', chance: 0.22 }, { item: 'item.lampenoel', chance: 0.1 }, { item: 'item.riechsalz', chance: 0.06 }] },
  { id: 'loot.licht', entries: [{ item: 'item.lampenoel', chance: 0.35 }, { item: 'item.balsam', chance: 0.12 }] },
  { id: 'loot.raff', entries: [{ item: 'item.balsam', chance: 0.3 }, { item: 'item.riechsalz', chance: 0.15 }, { item: 'item.kalkstaub', chance: 0.1 }] },
  { id: 'loot.stein', entries: [{ item: 'item.balsam', chance: 0.3 }, { item: 'item.kalkstaub', chance: 0.2 }] },
  { id: 'loot.boss', entries: [{ item: 'item.balsam', chance: 1, min: 2, max: 3 }, { item: 'item.riechsalz', chance: 1 }, { item: 'item.lampenoel', chance: 1 }, { item: 'item.kalkstaub', chance: 1 }] },
];

/** A loot table by id. */
export function lootTable(id: string): LootTable | undefined {
  return LOOT.find((l) => l.id === id);
}

/** Collection by id. */
export function collectionDef(id: string): CollectionSet | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/**
 * Collections (journal tab "Sammlungen"). Members are declared by the chapters' quest files
 * (`items` with `set`), so the content tracks place them without touching this file; the lists
 * here name the sets and their order. A set is complete when every member listed by any quest
 * file is owned.
 */
export const COLLECTIONS: readonly CollectionSet[] = [
  { id: 'chronikseiten', name_de: 'Seiten der Chronik', items: [], reward: { xp: 200 } },
  { id: 'hundemarken', name_de: 'Die Namen der Hunde', items: [], reward: { xp: 150 } },
  { id: 'steinzeichen', name_de: 'Matthes’ Zeichen', items: [], reward: { xp: 150 } },
  { id: 'planblaetter', name_de: 'Planblätter', items: [], reward: { xp: 150 } },
  { id: 'festplaene', name_de: 'Mannlichs Festpläne', items: [], reward: { xp: 100 } },
];

export const ITEM_IDS: ReadonlySet<string> = new Set(ITEMS.map((i) => i.id));
export const LOOT_IDS: ReadonlySet<string> = new Set(LOOT.map((l) => l.id));
export const COLLECTION_IDS: ReadonlySet<string> = new Set(COLLECTIONS.map((c) => c.id));

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}
