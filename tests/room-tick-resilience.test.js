import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import {attachRooms} from '../server/rooms.js';
import {battlePreset} from '../src/custom-battle.js';

// Regression: the 10 Hz room tick ran without a try/catch and the server had no
// process-level guards, so one throwing simulation escaped as an uncaught
// exception and terminated the process — dropping every live match, not just
// the broken one.

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class Inbox {
  constructor(ws) {
    this.items = [];
    this.waiters = [];
    ws.on('message', raw => {
      const packet = JSON.parse(raw);
      const index = this.waiters.findIndex(waiter => waiter.type === packet.type);
      if (index < 0) this.items.push(packet);
      else { const [waiter] = this.waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(packet); }
    });
  }
  next(type) {
    const index = this.items.findIndex(packet => packet.type === type);
    if (index >= 0) return Promise.resolve(this.items.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      this.waiters.push({type, resolve, timer: setTimeout(() => reject(new Error(`Missing ${type}`)), 6000)});
    });
  }
}

async function battle(t) {
  const server = http.createServer(), service = attachRooms(server, {maxRooms: 1}), clients = [];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const ws of clients) ws.terminate(); service.close(); await new Promise(resolve => server.close(resolve)); });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`), inbox = new Inbox(ws);
    clients.push(ws);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return {ws, inbox, send: packet => ws.send(JSON.stringify(packet))};
  };
  const host = await connect(), slots = battlePreset('2v2');
  slots[2].controller = 'human';
  host.send({type: 'create', protocol: 2, name: 'Host', options: {mode: 'custom', map: 'highlands', mapSize: 'spacious', seed: 512, slots}});
  const session = await host.inbox.next('session');
  const guest = await connect();
  guest.send({type: 'join', protocol: 2, name: 'Guest', code: session.code, slot: 3});
  await guest.inbox.next('session');
  guest.send({type: 'ready', ready: true});
  while (!(await host.inbox.next('lobby')).canStart) { /* wait for the host to see a startable lobby */ }
  host.send({type: 'start'});
  await host.inbox.next('begin');
  await guest.inbox.next('begin');
  const room = service.rooms.get(session.code);
  return {service, session, room, host, guest, connect};
}

test('a throwing room is closed without taking down the server', async t => {
  const {service, session, room, host, connect} = await battle(t);
  assert.ok(room.sim, 'the battle started');

  let ticks = 0;
  room.sim.tick = () => { ticks += 1; throw new Error('simulation exploded'); };

  const closed = await host.inbox.next('closed');
  assert.match(closed.message, /could not continue/i);
  assert.equal(ticks, 1, 'the failing tick ran exactly once');
  assert.equal(service.rooms.has(session.code), false, 'the broken room is released so its slot is reusable');

  // The interval is still alive: a fresh connection can create a new room after
  // the failure, proving the server process and its timers survived.
  await pause(150);
  const fresh = await connect(), slots = battlePreset('2v2');
  slots[2].controller = 'human';
  fresh.send({type: 'create', protocol: 2, name: 'Second host', options: {mode: 'custom', map: 'highlands', mapSize: 'spacious', seed: 513, slots}});
  const next = await fresh.inbox.next('session');
  assert.notEqual(next.code, session.code, 'the server keeps accepting rooms after a room failure');
});
