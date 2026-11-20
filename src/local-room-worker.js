import {createRoomPort} from './local-room-port.js';

// Dedicated Worker for an offline "Nearby" room. Running the authoritative
// simulation off the page thread keeps the host's own rendering smooth.
const receive=createRoomPort(message=>self.postMessage(message));
self.addEventListener('message',event=>receive(event.data));
self.postMessage({type:'ready'});
