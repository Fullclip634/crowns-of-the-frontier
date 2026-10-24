import test from 'node:test';import assert from 'node:assert/strict';import {customHostOptions} from '../src/custom-host.js';import {battlePreset} from '../src/custom-battle.js';
import {customBattleMarkup} from '../src/custom-battle-ui.js';

test('hosting from any chosen kingdom opens a distinct human slot and preserves the selected host',()=>{
  for(let playerSlot=1;playerSlot<=8;playerSlot++){
    const draft={mode:'custom',map:'highlands',mapSize:'vast',seed:2026,playerSlot,slots:battlePreset('4v4')};draft.slots[playerSlot-1].controller='human';const before=structuredClone(draft),battle=customHostOptions(draft);
    assert.equal(battle.slots[0].slotNumber,playerSlot);assert.equal(battle.slots.filter(slot=>slot.controller==='human').length,2);assert.ok(battle.slots.some(slot=>slot.slotNumber!==playerSlot&&slot.controller==='human'));assert.deepEqual(draft,before,'preparing a host does not silently change the setup draft');
  }
});

test('existing friend slots keep their controllers and spectators get an actionable explanation',()=>{
  const draft={mode:'custom',map:'highlands',mapSize:'vast',seed:2026,playerSlot:4,slots:battlePreset('4v4')};draft.slots[3].controller='human';draft.slots[6].controller='human';draft.slots[1].controller='human';
  assert.equal(customHostOptions(draft).slots.filter(slot=>slot.controller==='human').length,3);
  assert.throws(()=>customHostOptions({...draft,spectator:true}),/Choose a kingdom/);
});

test('setup labels distinguish play, spectating and multiplayer-only controllers',()=>{
  const draft={map:'highlands',mapSize:'vast',seed:2026,playerSlot:1,slots:battlePreset('2v2')},playing=customBattleMarkup(draft),watching=customBattleMarkup({...draft,playerSlot:0,spectator:true});
  assert.match(playing,/Play against AI/);assert.match(playing,/<option value="human"[^>]*>Human \(multiplayer\)/);assert.match(playing,/Standard — Commander/);
  assert.match(watching,/Watch AI battle/);assert.doesNotMatch(watching,/<option value="human"/);assert.match(watching,/data-action="custom-host" disabled/);
});

test('closing a middle kingdom does not renumber the remaining playable slots',()=>{
  const draft={map:'highlands',mapSize:'vast',seed:2026,playerSlot:3,slots:battlePreset('2v2')};draft.slots[1].enabled=false;
  const html=customBattleMarkup(draft),roles=html.match(/<select id="custom-player-slot">([\s\S]*?)<\/select>/)[1];
  assert.match(roles,/<option value="3" selected>Play as slot 3/);assert.doesNotMatch(roles,/<option value="2"/);assert.match(roles,/<option value="4"/);
  assert.match(html,/<select id="custom-type-1">/,'a closed kingdom keeps its controller picker available so it can be reopened');
});
