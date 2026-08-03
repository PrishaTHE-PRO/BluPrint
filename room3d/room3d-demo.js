// room3d-demo.js — sample use of the viewer. Swap `room` for a real room from
// your backend (same layout shape iso-preview.js already produces).
import { createRoomViewer } from './room3d.js';

const room = {
  name: 'Demo Bedroom', widthFt: 14, lengthFt: 12, heightFt: 9, scale: 20,
  roomPoints: [{x:260,y:130},{x:540,y:130},{x:540,y:370},{x:260,y:370}],
  furnitureLayout: [
    { category:'bedroom_rug',      x:400, y:250, wPx:170, dPx:110, rot:0 },
    { category:'bed',              x:400, y:210, wPx:110, dPx:150, rot:0 },
    { category:'nightstand',       x:320, y:150, wPx:35,  dPx:30,  rot:0 },
    { category:'nightstand',       x:480, y:150, wPx:35,  dPx:30,  rot:0 },
    { category:'dresser',          x:300, y:340, wPx:90,  dPx:30,  rot:0 },
    { category:'reading_nook',     x:500, y:330, wPx:55,  dPx:55,  rot:200 },
    { category:'floor_lamp',       x:520, y:290, wPx:24,  dPx:24,  rot:0 },
    { category:'indoor_plants',    x:290, y:160, wPx:30,  dPx:30,  rot:0 },
    { category:'bookshelf',        x:420, y:145, wPx:55,  dPx:20,  rot:0 },
    { category:'full_length_mirror', x:300, y:250, wPx:24, dPx:12, rot:90 },
  ],
};

const stage = document.getElementById('stage');
const viewer = createRoomViewer(stage, { style: 'scandinavian' });
viewer.render(room);

// simple style switcher
document.getElementById('style')?.addEventListener('change', (e) => {
  viewer.dispose();
  const v = createRoomViewer(stage, { style: e.target.value });
  v.render(room);
  window.__viewer = v;
});
window.__viewer = viewer;
