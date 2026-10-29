// Mode rules: what a kill is worth, what you spawn holding, and when it's over.
//
// Everything mode-specific lives here so room.js stays a plain state machine.

import { TEAMS, TEAM_IDS, SCORE_LIMIT, MAX_PLAYERS, ARENA_MAX_PLAYERS, BR_MAX_PLAYERS } from '../shared/constants.js';
import { PRIMARY_IDS, GUNGAME_LADDER, loadoutForPrimary } from '../shared/weapons.js';
import { LARGE_TEAM_MAPS } from '../shared/maps/index.js';

export function isTeamMode(mode) {
  return mode === 'tdm' || mode === 'duel' || mode === 'squads';
}

/**
 * Modes where team membership decides who can shoot whom, even if the HUD doesn't
 * show team scores. Survival is co-op: humans are team A, the AI are team B.
 */
export function hasSides(mode) {
  return isTeamMode(mode) || mode === 'waves';
}

export function isSurvival(mode) {
  return mode === 'waves';
}

export function isBattleRoyale(mode) {
  return mode === 'br';
}

/** How many slots this mode's lobby has. Large island modes hold sixteen. */
export function capacityFor(mode, mapId = 'island') {
  if (mode === 'duel') return 2;
  if (mode === 'squads') return 4;
  if (isBattleRoyale(mode)) return BR_MAX_PLAYERS;
  return isTeamMode(mode) && LARGE_TEAM_MAPS.includes(mapId) ? MAX_PLAYERS : ARENA_MAX_PLAYERS;
}

export function activeTeams(room) {
  return TEAM_IDS.slice(0, isTeamMode(room.mode) ? (room.teamCount ?? 2) : 2);
}

export function emptyScores(room) {
  return Object.fromEntries(activeTeams(room).map((team) => [team, 0]));
}

/** Battle royale is played on one purpose-built map, never the rotation. */
export function mapForMode(mode, current) {
  if (isBattleRoyale(mode)) return 'island';
  if (mode === 'tdm') return LARGE_TEAM_MAPS.includes(current) ? current : 'island';
  return LARGE_TEAM_MAPS.includes(current) ? 'warehouse' : current;
}

/**
 * Put a joining player on the smaller team. On a tie, alternate — otherwise
 * everyone who joins an empty room piles onto team A.
 */
export function assignTeam(room, player) {
  // Battle royale is solo: no teams at all, so everyone can shoot everyone.
  if (isBattleRoyale(room.mode)) return null;
  // Survival: everyone who joined is on the same side, and the AI are told which
  // team they're on when they're created.
  if (isSurvival(room.mode)) return player.isBot ? TEAMS.B : TEAMS.A;
  if (!isTeamMode(room.mode)) return null;

  const teams = activeTeams(room);
  const counts = Object.fromEntries(teams.map((team) => [team, 0]));
  for (const p of room.players.values()) {
    if (p === player) continue;
    if (Object.hasOwn(counts, p.team)) counts[p.team]++;
  }
  return teams.reduce((best, team) => counts[team] < counts[best] ? team : best, teams[0]);
}

/**
 * Rebalance if the teams have drifted more than one apart — happens naturally
 * when people leave mid-match.
 */
export function rebalance(room) {
  if (!isTeamMode(room.mode)) return [];

  const teams = activeTeams(room);
  const byTeam = Object.fromEntries(teams.map((team) => [team, []]));
  for (const p of room.players.values()) byTeam[p.team]?.push(p);

  const moved = [];
  while (true) {
    const bySize = [...teams].sort((a, b) => byTeam[a].length - byTeam[b].length);
    const to = bySize[0];
    const from = bySize[bySize.length - 1];
    if (byTeam[from].length - byTeam[to].length <= 1) break;
    // Move the most recent joiner — least disruptive to anyone mid-fight.
    const victim = byTeam[from].sort((x, y) => y.joinedAt - x.joinedAt)[0];
    if (!victim) break;
    byTeam[from] = byTeam[from].filter((p) => p !== victim);
    victim.team = to;
    byTeam[to].push(victim);
    moved.push(victim);
  }
  return moved;
}

export function loadoutFor(room, player) {
  // Skill-based versus queues have an identical loadout on both sides.
  if (room.mode === 'duel') return loadoutForPrimary('sniper');
  if (room.mode === 'squads') return loadoutForPrimary('rifle');
  // Battle royale: everyone lands with a pistol and a knife, whatever they picked
  // in the lobby. Finding a better gun is the mode; handing you your favourite at
  // the start would remove the reason to loot.
  if (isBattleRoyale(room.mode)) return ['pistol', 'knife'];
  if (room.mode === 'gungame') {
    const id = GUNGAME_LADDER[Math.min(player.ladderIndex, GUNGAME_LADDER.length - 1)];
    // Only the current rung — that's the whole point of the mode, and it's why
    // Gun Game ignores your class.
    return [id];
  }
  return loadoutForPrimary(player.primaryId);
}

/** Does the player's own class choice decide their loadout in this mode? */
export function usesClasses(mode) {
  return mode !== 'gungame' && mode !== 'duel' && mode !== 'squads';
}

export function spawnPointsFor(room, map, player) {
  // Survival: humans hold the team-A end, enemies come from everywhere else.
  if (isSurvival(room.mode)) {
    return player.isBot ? (map.spawns.ffa ?? map.spawns.B) : (map.spawns.A ?? map.spawns.ffa);
  }
  if (isTeamMode(room.mode)) return map.spawns[player.team] ?? map.spawns.ffa;
  return map.spawns.ffa;
}

export function canDamage(room, attacker, victim) {
  if (attacker.id === victim.id) return false;
  // Any mode with sides protects your own side. Survival relies on this so a
  // co-op partner can't shoot you in the back.
  if (hasSides(room.mode) && attacker.team && victim.team && attacker.team === victim.team) {
    return false;
  }
  // Friendly fire off. With coworkers, accidental teamkills generate far more
  // friction than they generate interesting decisions.
  if (isTeamMode(room.mode) && attacker.team === victim.team) return false;
  return true;
}

/**
 * Apply the scoring consequences of a kill. Returns anything the clients need
 * to be told about beyond the kill itself (a gun-game promotion, say).
 */
export function onKill(room, killer, victim, weaponId) {
  victim.deaths += 1;

  if (!killer || killer.id === victim.id) {
    // Suicide, fall damage or the void: costs you, but nobody gains.
    if (killer) killer.score = Math.max(0, killer.score - 1);
    return { promoted: false, newWeapon: null };
  }

  killer.kills += 1;

  if (room.mode === 'gungame') {
    killer.ladderIndex += 1;
    killer.score = killer.ladderIndex;
    const finished = killer.ladderIndex >= GUNGAME_LADDER.length;
    return {
      promoted: !finished,
      newWeapon: finished ? null : GUNGAME_LADDER[killer.ladderIndex],
    };
  }

  killer.score += 1;
  if (isTeamMode(room.mode)) {
    room.teamScores[killer.team] = (room.teamScores[killer.team] ?? 0) + 1;
  }

  return { promoted: false, newWeapon: null };
}

/**
 * Has anyone won outright? Returns a result object, or null to keep playing
 * until the clock runs out.
 */
export function checkWin(room) {
  if (isSurvival(room.mode)) return null;
  // Battle royale ends when one player is left. Handled by the room, which knows
  // who is still alive.
  if (isBattleRoyale(room.mode)) return null;
  if (room.mode === 'gungame') {
    for (const p of room.players.values()) {
      if (p.ladderIndex >= GUNGAME_LADDER.length) {
        return { reason: 'ladder', winnerId: p.id, winnerName: p.name };
      }
    }
    return null;
  }

  const limit = SCORE_LIMIT[room.mode];
  if (!limit) return null;

  if (isTeamMode(room.mode)) {
    for (const team of activeTeams(room)) {
      if ((room.teamScores[team] ?? 0) >= limit) {
        return { reason: 'scorelimit', winnerTeam: team };
      }
    }
    return null;
  }

  for (const p of room.players.values()) {
    if (p.score >= limit) {
      return { reason: 'scorelimit', winnerId: p.id, winnerName: p.name };
    }
  }
  return null;
}

/** Who won when the clock ran out. */
export function resultAtTimeUp(room) {
  if (isBattleRoyale(room.mode)) {
    // Called when the clock runs out with several alive, which the final circle
    // makes unlikely but not impossible.
    let best = null;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      if (!best || p.kills > best.kills) best = p;
    }
    return best
      ? { reason: 'br', winnerId: best.id, winnerName: best.name }
      : { reason: 'draw' };
  }
  if (isSurvival(room.mode)) {
    return { reason: 'survival', wave: room.wave?.number ?? 0 };
  }
  if (isTeamMode(room.mode)) {
    const ranking = activeTeams(room).sort((a, b) => (room.teamScores[b] ?? 0) - (room.teamScores[a] ?? 0));
    if ((room.teamScores[ranking[0]] ?? 0) === (room.teamScores[ranking[1]] ?? 0)) return { reason: 'draw' };
    return { reason: 'timeup', winnerTeam: ranking[0] };
  }

  let best = null;
  let tied = false;
  for (const p of room.players.values()) {
    if (!best || p.score > best.score) {
      best = p;
      tied = false;
    } else if (best && p.score === best.score) {
      tied = true;
    }
  }
  if (!best) return { reason: 'draw' };
  if (tied) return { reason: 'draw' };
  return { reason: 'timeup', winnerId: best.id, winnerName: best.name };
}

export function describeResult(room, result) {
  if (!result) return 'Round over';
  if (result.reason === 'br') return `${result.winnerName} is the last one standing`;
  if (result.reason === 'survival') {
    const n = result.wave ?? 0;
    return n <= 1 ? 'Overrun on the first wave' : `Survived ${n - 1} waves`;
  }
  if (result.reason === 'draw') return 'Draw';
  if (result.winnerTeam) {
    return `Team ${result.winnerTeam} wins`;
  }
  if (result.reason === 'ladder') return `${result.winnerName} ran the table`;
  return `${result.winnerName} wins`;
}

export function resetScores(room) {
  room.teamScores = emptyScores(room);
  for (const p of room.players.values()) {
    p.score = 0;
    p.kills = 0;
    p.deaths = 0;
    p.ladderIndex = 0;
  }
}

export const ROOM_CAPACITY = MAX_PLAYERS;

/** A random class for an AI, so a lobby of bots isn't six identical soldiers. */
export function randomPrimaryId() {
  return PRIMARY_IDS[Math.floor(Math.random() * PRIMARY_IDS.length)];
}
