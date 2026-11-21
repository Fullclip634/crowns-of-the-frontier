// Solo matches keep the last visible state only for resource nodes that actually
// change in explored fog. Simulation and command queries use the real entities.
const unseenFelling = new WeakSet();

export function takeFromResource(sim, site, amount) {
  const hidden = site.kind === 'resource' && !sim.options.multiplayer && !sim.options.spectator &&
    !sim.isVisible(site.x, site.z);
  if (hidden && amount > 0 && !sim.resourceMemory?.has(site.id) && sim.isExplored(site.x, site.z)) {
    (sim.resourceMemory ??= new Map()).set(site.id, {...site});
  }
  site.amount -= amount;
  if (!(site.amount <= 0)) return false;
  if (hidden && site.type === 'wood') unseenFelling.add(site);
  site.hp = 0;
  sim.resourceRevision = (sim.resourceRevision || 0) + 1;
  return true;
}

export const wasFelledOutOfSight = site => unseenFelling.has(site);

export function revealResourceChanges(sim) {
  const memory = sim.resourceMemory;
  if (!memory) return;
  let changed = false;
  for (const [id, site] of memory) {
    if (sim.isVisible(site.x, site.z)) {memory.delete(id); changed = true;}
  }
  if (changed) sim.resourceRevision = (sim.resourceRevision || 0) + 1;
  if (!memory.size) sim.resourceMemory = undefined;
}

export function serializeResourceMemory(sim) {
  if (!sim.resourceMemory?.size) return {};
  return {resourceMemory: Array.from(sim.resourceMemory.values(), site => [site.id, site.hp, site.amount])};
}

export function restoreResourceMemory(sim, data) {
  if (!Array.isArray(data) || !data.length || sim.options.multiplayer || sim.options.spectator) return;
  const saved = new Map();
  for (const entry of data) {
    if (!Array.isArray(entry)) continue;
    const [id, hp, amount] = entry;
    if (Number.isSafeInteger(id) && Number.isFinite(hp) && hp > 0 && Number.isFinite(amount) && amount > 0) {
      saved.set(id, {hp, amount});
    }
  }
  for (const site of sim.entities) {
    if (site.kind !== 'resource') continue;
    const observed = saved.get(site.id);
    if (!observed || !sim.isExplored(site.x, site.z)) continue;
    (sim.resourceMemory ??= new Map()).set(site.id, {...site, ...observed});
    if (site.type === 'wood' && site.hp <= 0) unseenFelling.add(site);
  }
  if (sim.resourceMemory?.size) sim.resourceRevision = (sim.resourceRevision || 0) + 1;
}
