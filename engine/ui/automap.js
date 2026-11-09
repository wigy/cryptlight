// The automap: draws what the party has seen of the current level, from Game's `level.explored`.
const CELL = 11; // Fits the largest module level so far (31 x 23) in the side panel.
const WIDTH = 31 * CELL, HEIGHT = 23 * CELL;
const DENSITY = 2; // Canvas pixels per stage pixel, so it stays sharp when the stage is scaled up.

const COLORS = {
  wall: '#35322e', floor: '#7d6c4c', stairs: '#6fc3d8',
  door: '#d9b45a', portcullis: '#a8a8a8', party: '#ff5a3c', partyEdge: '#000',
};

export function createAutomap() {
  const canvas = document.createElement('canvas');
  canvas.id = 'automap';
  canvas.width = WIDTH * DENSITY;
  canvas.height = HEIGHT * DENSITY;
  return canvas;
}

function drawDoor(ctx, door, px, py) {
  ctx.fillStyle = door.style === 'portcullis' ? COLORS.portcullis : COLORS.door;
  const long = door.open >= 0.5 ? 3 : CELL; // An open door shrinks to a stub at the frame.
  const thick = 3;
  const mid = (CELL - thick) / 2;
  if (door.axis === 'y') ctx.fillRect(px, py + mid, long, thick); // Passed north-south, so it spans east-west.
  else ctx.fillRect(px + mid, py, thick, long);
}

function drawParty(ctx, party, ox, oy) {
  const cx = ox + (party.x + 0.5) * CELL, cy = oy + (party.y + 0.5) * CELL;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((party.dir * Math.PI) / 2); // Directions run clockwise from north, which is up.
  ctx.beginPath();
  ctx.moveTo(0, -5.5);
  ctx.lineTo(4.5, 4.5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 4.5);
  ctx.closePath();
  ctx.fillStyle = COLORS.party;
  ctx.strokeStyle = COLORS.partyEdge;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Redraws only when something on the map changed. */
export function drawAutomap(canvas, game) {
  const level = game.level;
  const p = game.party;
  const doors = level.objects.filter((o) => o.type === 'door');
  const key = [level.id, p.x, p.y, p.dir, game.exploreVersion, doors.map((d) => d.open >= 0.5 ? 1 : 0).join('')].join();
  if (canvas._key === key) return;
  canvas._key = key;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DENSITY, 0, 0, DENSITY, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const ox = Math.floor((WIDTH - level.width * CELL) / 2), oy = Math.floor((HEIGHT - level.height * CELL) / 2);
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (!level.explored?.[y * level.width + x]) continue;
      const c = level.cells[y][x];
      const px = ox + x * CELL, py = oy + y * CELL;
      // Hidden doors ('S') stay walls until found, so the map gives nothing away.
      ctx.fillStyle = c === '#' || c === ' ' || c === 'S' ? COLORS.wall : c === '<' ? COLORS.stairs : COLORS.floor;
      ctx.fillRect(px, py, CELL, CELL);
    }
  }
  for (const d of doors) {
    if (d.secret || !level.explored?.[d.y * level.width + d.x]) continue;
    drawDoor(ctx, d, ox + d.x * CELL, oy + d.y * CELL);
  }
  drawParty(ctx, p, ox, oy);
}
