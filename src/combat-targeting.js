import {UNITS, BUILDINGS} from './data.js';
import {forEachNearbyUnit} from './spatial-buckets.js';

export const VALID_STANCES = Object.freeze(['hold', 'defensive', 'aggressive']);

const HELP_ALERT_RADIUS = 26;
const HELP_THROTTLE_SECONDS = 1.25;
const HELP_MEMORY_SECONDS = 5.0;
const RETALIATE_MEMORY_SECONDS = 4.5;
const RETALIATE_MAX_RANGE = 34;
const HELP_MAX_CHASE_RANGE = 54;
const STICKY_TARGET_BONUS = 2.5;
const WATER_CROSSING_PENALTY = 22;

const isWallBuilding = t => t.kind === 'building' && (t.type === 'wall' || t.type === 'gate');

export function unitAttackRange(sim, e) {
  const d = UNITS[e?.type];
  if (!d) return 0;
  const rangedTech = d.role === 'ranged' && !d.naval ? (sim.players?.[e.owner]?.tech?.ranged || 0) : 0;
  return (d.range || 0) + rangedTech;
}

export function defensiveLeashRadius(weaponRange) {
  return Math.max(12.5, (weaponRange || 0) + 3.5);
}

export function ensureGuardPost(e) {
  if (!Number.isFinite(e.guardX) || !Number.isFinite(e.guardZ)) {
    e.guardX = e.x;
    e.guardZ = e.z;
  }
  return {x: e.guardX, z: e.guardZ};
}

export function withinDefensiveLeash(e, target, post, leashRadius, weaponRange) {
  const targetFromPost = Math.hypot(target.x - post.x, target.z - post.z) - (target.r || 0);
  if (targetFromPost <= leashRadius) return true;
  // Allow a defensive unit already standing at its post to fire on an in-range threat without chasing.
  const unitFromPost = Math.hypot(e.x - post.x, e.z - post.z);
  if (unitFromPost <= 3) {
    return Math.hypot(e.x - target.x, e.z - target.z) <= weaponRange + (target.r || 0);
  }
  return false;
}

export function applyRallyOrder(sim, unit, building) {
  const rally = building?.rally;
  if (!rally || !unit) return;
  const d = UNITS[unit.type];
  const rallyTarget = rally.target ? sim.get(rally.target) : null;
  if (unit.type === 'villager') {
    if (rallyTarget?.kind === 'resource' && !rallyTarget.water) {
      unit.order = {type: 'gather', target: rallyTarget.id};
    } else if (rallyTarget?.kind === 'building' && rallyTarget.owner === unit.owner && rallyTarget.progress < 1) {
      unit.order = {type: 'build', target: rallyTarget.id};
    } else if (rallyTarget?.kind === 'building' && rallyTarget.owner === unit.owner && rallyTarget.type === 'farm') {
      unit.order = {type: 'gather', target: rallyTarget.id};
    } else {
      unit.order = {type: 'move', x: rally.x, z: rally.z};
    }
    return;
  }
  if (unit.type === 'fishingboat') {
    if (rallyTarget?.kind === 'resource' && rallyTarget.water) {
      unit.order = {type: 'gather', target: rallyTarget.id};
    } else {
      unit.order = {type: 'move', x: rally.x, z: rally.z};
    }
    return;
  }
  const isCombat = (d?.damage || 0) > 0 && !['worker', 'fisher', 'healer', 'transport', 'quest'].includes(d.role);
  unit.order = {type: isCombat ? 'attackmove' : 'move', x: rally.x, z: rally.z};
}

export function alertNearbyDefenders(sim, victim, attacker) {
  if (!victim || !attacker || attacker.id == null) return;
  if (attacker.owner < 0 || victim.owner < 0 || !sim.hostile(attacker.owner, victim.owner)) return;
  const isProtected = victim.kind === 'building' || (victim.kind === 'unit' && UNITS[victim.type]?.role === 'worker');
  if (!isProtected) return;
  if (sim.time - (victim.lastHelpAt ?? -Infinity) < HELP_THROTTLE_SECONDS) return;
  victim.lastHelpAt = sim.time;

  const threat = sim.get(attacker.id);
  if (!threat || threat.hp <= 0 || threat.embarked) return;
  const threatNaval = threat.kind === 'unit' && !!UNITS[threat.type]?.naval;
  const scanRadius = HELP_ALERT_RADIUS + (victim.r || 0);

  forEachNearbyUnit(sim, victim.x, victim.z, scanRadius, u => {
    if (u.hp <= 0 || u.embarked || u.owner !== victim.owner || u === victim) return;
    // Never hijack units executing explicit player/AI orders or holding ground.
    if (u.order || u.stance === 'hold' || u.type === 'king') return;
    const def = UNITS[u.type];
    if (!def || !(def.damage > 0) || ['worker', 'fisher', 'healer', 'transport', 'quest'].includes(def.role)) return;
    // Battering rams are dedicated building-breakers; do not send them chasing raiding units.
    if (u.type === 'ram' && threat.kind === 'unit') return;
    const distToVictim = Math.hypot(u.x - victim.x, u.z - victim.z) - (victim.r || 0);
    if (distToVictim > HELP_ALERT_RADIUS) return;

    const weaponRange = unitAttackRange(sim, u);
    const distToThreat = Math.hypot(u.x - threat.x, u.z - threat.z);
    if (!def.naval && threatNaval && weaponRange < 5 && distToThreat > weaponRange + (threat.r || 0)) return;
    if (def.naval && distToThreat > weaponRange + (threat.r || 0) + 12) return;

    if (u.stance === 'defensive') {
      const post = ensureGuardPost(u);
      if (!withinDefensiveLeash(u, threat, post, defensiveLeashRadius(weaponRange), weaponRange)) return;
    }

    u.helpTargetId = threat.id;
    u.helpUntil = sim.time + HELP_MEMORY_SECONDS;
  });
}

function crossesWater(sim, a, b) {
  if (typeof sim.isWater !== 'function') return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  return sim.isWater(a.x + dx * 0.5, a.z + dz * 0.5)
    || sim.isWater(a.x + dx * 0.33, a.z + dz * 0.33)
    || sim.isWater(a.x + dx * 0.67, a.z + dz * 0.67);
}

export function combatScoreAdjustment(sim, e, d, target, weaponRange, gap) {
  let adj = 0;
  if (target.id === e.lastCombatTargetId) adj -= STICKY_TARGET_BONUS;
  if (target.id === e.lastAttackerId && sim.time - (e.lastAttackedAt ?? -Infinity) <= RETALIATE_MEMORY_SECONDS) {
    adj -= 1.5;
  }

  const other = target.kind === 'unit' ? UNITS[target.type] : null;
  const bdef = target.kind === 'building' ? BUILDINGS[target.type] : null;

  if (e.type === 'ram') {
    if (target.kind === 'building') adj -= bdef?.damage ? 14 : 10;
    else adj += 12;
  } else if (e.type === 'trebuchet') {
    if (target.kind === 'building') adj -= (bdef?.damage || target.type === 'wonder') ? 10 : 7;
    else if (other?.role === 'siege') adj -= 6;
  } else if (e.type === 'catapult' || e.type === 'warship') {
    if (other?.role === 'ranged' || other?.role === 'siege') adj -= 4.5;
    else if (target.kind === 'building' && bdef?.damage) adj -= 3.5;
  } else if (d.role === 'spear') {
    if (other?.role === 'cavalry') adj -= 5.5;
  } else if (d.antiRanged > 1) {
    if (other?.role === 'ranged') adj -= 5.5;
  } else if (d.role === 'cavalry') {
    if (e.type === 'outrider') {
      if (other?.role === 'worker') adj -= 4.5;
      else if (other?.role === 'ranged' || other?.role === 'siege') adj -= 4.0;
    } else if (other?.role === 'siege') {
      adj -= 5.5;
    } else if (other?.role === 'ranged') {
      adj -= 4.5;
    }
  } else if (e.type === 'ironbreaker') {
    if (target.kind === 'building' && bdef?.damage) adj -= 3.5;
    else if (other && (other.armor || 0) >= 3) adj -= 2.5;
  } else if (d.role === 'ranged' && !d.naval) {
    if (other?.role === 'spear') adj -= 3.0;
    else if (other?.role === 'ranged') adj -= 2.0;
  }

  // Active combat units take priority over unarmed workers/quest carts unless the attacker is a worker-raider.
  if (other && e.type !== 'outrider' && ['worker', 'fisher', 'quest', 'transport'].includes(other.role)) {
    adj += 5.0;
  }
  // Normal frontline troops prefer clearing nearby enemy soldiers before hitting towers right next to them.
  if (target.kind === 'building' && bdef?.damage && e.type !== 'ram' && e.type !== 'trebuchet' && e.type !== 'ironbreaker') {
    adj += 1.5;
  }

  // Prevent land melee units from locking onto enemies across unbridged water when a same-bank threat exists.
  if (!d.naval && weaponRange <= 4 && gap > weaponRange && crossesWater(sim, e, target)) {
    adj += WATER_CROSSING_PENALTY;
  }

  return adj;
}

export function pickCombatTarget(sim, e, order, guard, ownerMask) {
  const d = UNITS[e.type];
  if (!d) return null;
  const weaponRange = unitAttackRange(sim, e);
  const detectRange = e.stance === 'hold' ? weaponRange : Math.max(weaponRange, d.role === 'siege' ? 27 : 13);
  const defensivePost = e.stance === 'defensive' && !order ? ensureGuardPost(e) : null;
  const leashRadius = defensivePost ? defensiveLeashRadius(weaponRange) : Infinity;
  const targetOwners = ownerMask === undefined ? -1 : ownerMask;
  const isSiegeBreaker = e.type === 'ram' || e.type === 'trebuchet';

  let bestTier1 = null, scoreTier1 = Infinity;
  let bestTier2 = null, scoreTier2 = Infinity;
  let bestTier3 = null, scoreTier3 = Infinity;

  const canEngage = t => {
    if (!t || t.hp <= 0 || t === e || t.embarked || !sim.hostile(e.owner, t.owner)) return false;
    if (t.kind !== 'unit' && t.kind !== 'building') return false;
    const tDef = t.kind === 'unit' ? UNITS[t.type] : null;
    if (!d.naval && tDef?.naval && weaponRange < 5 && Math.hypot(e.x - t.x, e.z - t.z) > weaponRange + t.r) return false;
    if (guard && Math.hypot(t.x - guard.x, t.z - guard.z) >= 18) return false;
    if (defensivePost && !withinDefensiveLeash(e, t, defensivePost, leashRadius, weaponRange)) return false;
    return true;
  };

  const evaluate = (target, gap) => {
    const wall = isWallBuilding(target);
    const bdef = target.kind === 'building' ? BUILDINGS[target.type] : null;
    const score = gap + combatScoreAdjustment(sim, e, d, target, weaponRange, gap);
    if (wall) {
      if (score < scoreTier3) {scoreTier3 = score; bestTier3 = target;}
    } else if (target.kind === 'unit' || (bdef?.damage || 0) > 0 || isSiegeBreaker) {
      if (score < scoreTier1) {scoreTier1 = score; bestTier1 = target;}
    } else {
      if (score < scoreTier2) {scoreTier2 = score; bestTier2 = target;}
    }
  };

  sim.nearest(e, null, detectRange, true, targetOwners, (target, gap) => {
    if (!canEngage(target)) return;
    evaluate(target, gap);
  });

  // Long-range awareness: retaliate against distant fire (marksmen/towers/siege) and answer nearby base calls for help.
  if (e.stance !== 'hold') {
    if (e.lastAttackerId != null) {
      if (sim.time - (e.lastAttackedAt ?? -Infinity) <= RETALIATE_MEMORY_SECONDS) {
        const attacker = sim.get(e.lastAttackerId);
        if (attacker && canEngage(attacker)) {
          const gap = Math.hypot(e.x - attacker.x, e.z - attacker.z) - attacker.r;
          if (gap >= detectRange && gap <= RETALIATE_MAX_RANGE) evaluate(attacker, gap);
        } else {
          delete e.lastAttackerId;
        }
      } else {
        delete e.lastAttackerId;
      }
    }
    if (!order && e.helpTargetId != null) {
      if (sim.time <= (e.helpUntil ?? -Infinity)) {
        const threat = sim.get(e.helpTargetId);
        if (threat && canEngage(threat)) {
          const gap = Math.hypot(e.x - threat.x, e.z - threat.z) - threat.r;
          if (gap >= detectRange && gap <= HELP_MAX_CHASE_RANGE) evaluate(threat, gap);
        } else {
          delete e.helpTargetId;
          delete e.helpUntil;
        }
      } else {
        delete e.helpTargetId;
        delete e.helpUntil;
      }
    }
  }

  if (bestTier1) return bestTier1;
  if (bestTier2) return bestTier2;
  if (bestTier3) {
    const routeBlocked = order?.type === 'attackmove' && e.pathStatus === 'blocked';
    const onlyWallsRemain = !order
      && !sim.candidatesFor('unit').some(u => u.hp > 0 && !u.embarked && sim.hostile(e.owner, u.owner))
      && !sim.candidatesFor('building').some(b => b.hp > 0 && !isWallBuilding(b) && sim.hostile(e.owner, b.owner));
    if (routeBlocked || onlyWallsRemain) return bestTier3;
  }
  return null;
}

export function pickBuildingTarget(sim, e, fireRange, ownerMask) {
  const targetOwners = ownerMask === undefined ? -1 : ownerMask;
  let bestUnit = null, scoreUnit = Infinity;
  let bestBuilding = null, scoreBuilding = Infinity;
  let bestWall = null, scoreWall = Infinity;

  const isBombard = e.type === 'bombard';
  const freshAttackerId = e.lastAttackerId != null && sim.time - (e.lastAttackedAt ?? -Infinity) <= RETALIATE_MEMORY_SECONDS
    ? e.lastAttackerId
    : null;

  sim.nearest(e, null, fireRange, true, targetOwners, (target, gap) => {
    if (target.embarked || !sim.hostile(e.owner, target.owner)) return;

    let score = gap;
    if (target.id === e.lastCombatTargetId) score -= 1.5;
    if (freshAttackerId != null && target.id === freshAttackerId) score -= 4.0;

    if (target.kind === 'unit') {
      const u = UNITS[target.type];
      if (isBombard) {
        if (u?.role === 'siege') score -= 16;
        else if (u?.hero || u?.role === 'cavalry' || (u?.armor || 0) >= 3) score -= 5;
        else if (u && ['worker', 'fisher', 'quest'].includes(u.role)) score += 8;
      } else {
        if (u?.role === 'siege') score -= 8;
        else if ((u?.damage || 0) > 0 && u?.role !== 'worker') score -= 3;
        else if (u && ['worker', 'fisher', 'quest'].includes(u.role)) score += 5;
      }
      if (score < scoreUnit) {scoreUnit = score; bestUnit = target;}
    } else if (!isWallBuilding(target)) {
      if ((BUILDINGS[target.type]?.damage || 0) > 0) score -= 2;
      if (score < scoreBuilding) {scoreBuilding = score; bestBuilding = target;}
    } else {
      if (score < scoreWall) {scoreWall = score; bestWall = target;}
    }
  });

  const chosen = bestUnit || bestBuilding || bestWall;
  e.lastCombatTargetId = chosen ? chosen.id : null;
  return chosen;
}
