// Runs all pack builders in order.
const order = ['codex', 'speakers', 'kapitel1', 'kapitel2', 'kapitel3', 'kapitel4', 'voices', 'enden'];
for (const f of order) {
  await import(`./${f}.mjs`);
}
