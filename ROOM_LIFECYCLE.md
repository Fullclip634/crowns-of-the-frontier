# Multiplayer room lifecycle

A short abandoned match could keep the server's only room occupied until the
150-second orphan deadline, even after every human explicitly left. An expired
lobby host could leave connected guests in a lobby that could never start, and
an expired guest could permanently occupy its human slot. These cases were
reproduced with real local WebSocket clients before changing the behavior.

Rooms now release capacity immediately when every human has conceded or left
and no participant remains connected. A connected resigned observer or result
viewer keeps the room. An unexpected interruption still grants the existing
two-minute reconnect window; a disconnected commander who has not conceded
reserves the match until that deadline. Once the final reconnect opportunity
expires, the empty room no longer waits for the separate orphan timeout.

Before a match starts, a host who reconnects within that window retains the
lobby. After host expiry, remaining guests receive a clear room-closed message
and their connections close gracefully. An expired guest is removed, the host's
lobby refreshes, and a replacement can join the vacated human slot. Explicit
host cancellation uses the same lobby-close behavior.

Game commands, ready changes and leave requests must belong to the room's
current socket. After a session resumes on another connection, late application
messages from the replaced connection cannot spend resources or concede the
resumed commander. The regression test injects such queued application events;
it is not a claim of a demonstrated remote exploit.

This keeps deliberate exits distinct from network failures, consistent with
[Render's WebSocket reconnect guidance](https://render.com/docs/websocket).
Lobby closure uses the supported [ws close handshake](https://github.com/websockets/ws/blob/master/doc/ws.md#websocketclosecode-reason).
The service remains on the existing Free plan with one simultaneous room; it
does not add a database or preserve matches through a server restart.

`tests/room-lifecycle.test.js` covers custom/AI and classic matches, immediately
starting another room, active result viewers, reconnect/expiry, resigned
observers, replaced connections and both lobby expiry cases. The production
browser fixture also supports `QA_ROOM_LIFECYCLE=1` to check single-room capacity,
phone exit/rehost, host-expiry notice/session cleanup and creating another room
without a page reload.

Broader device, balance and release goals remain in [QUALITY_TARGETS.md](QUALITY_TARGETS.md).
