const WIDTH = 72;
const HEIGHT = 16;
export const SEATS = 20;

const PALETTE = {
  ".": "100A17", r: "260F23", d: "481429", c: "7F1D36", v: "BA334E", h: "EF6C62",
  s: "211E3A", b: "3D3B61", "+": "67577F", w: "FFF0CF", a: "FFBB64", o: "BD6E40",
  u: "45334F", l: "6C4A68", g: "79DCB5",
};

const XPM_HEADER = "! XPM2\n" + WIDTH + " " + HEIGHT + " " + Object.keys(PALETTE).length + " 1\n" +
  Object.keys(PALETTE).map((symbol) => symbol + " c #" + PALETTE[symbol]).join("\n") + "\n";

const DIGITS = {
  "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [7, 1, 7, 4, 7],
  "3": [7, 1, 7, 1, 7], "4": [5, 5, 7, 1, 1], "5": [7, 4, 7, 1, 7],
  "6": [7, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2], "8": [7, 5, 7, 5, 7],
  "9": [7, 5, 7, 1, 7], ".": [0, 0, 0, 0, 2], "-": [0, 0, 7, 0, 0],
  K: [5, 5, 6, 5, 5], M: [5, 7, 7, 5, 5], B: [6, 5, 6, 5, 6],
  T: [7, 2, 2, 2, 2],
};

const ROWS = [
  { y: 8, first: 23, step: 6, width: 3 },
  { y: 10, first: 19, step: 8, width: 3 },
  { y: 12, first: 15, step: 10, width: 4 },
  { y: 14, first: 11, step: 12, width: 4 },
];
const SEAT_ORDER = [2, 1, 3, 0, 4];

export function filledSeats(views, goal) {
  return views == null ? 0 : Math.min(SEATS, Math.floor(views * SEATS / goal));
}

function compact(count) {
  if (count == null) return "---";
  if (count < 10000) return String(count);
  if (count >= 1e12) return (Math.floor(count / 1e11) / 10) + "T";
  if (count >= 1e9) return (Math.floor(count / 1e8) / 10) + "B";
  if (count >= 1e6) return (Math.floor(count / 1e5) / 10) + "M";
  return (Math.floor(count / 100) / 10) + "K";
}

function putText(pixels, label, y, color) {
  let x = Math.floor((WIDTH - label.length * 4 + 1) / 2);
  for (const digit of label) {
    const rows = DIGITS[digit];
    for (let line = 0; line < rows.length; line++) {
      for (let column = 0; column < 3; column++) {
        if (rows[line] & (4 >> column)) pixels[y + line][x + column] = color;
      }
    }
    x += 4;
  }
}

function drawCurtains(pixels, opening) {
  for (let y = 0; y < 12; y++) {
    const openWidth = [17, 15, 13, 12, 11, 9, 8, 7, 7, 8, 9, 9][y];
    const width = Math.round(36 + (openWidth - 36) * opening);
    for (let x = 0; x < width; x++) {
      const fold = (x + Math.floor(y / 3)) % 7;
      const edge = x === width - 1;
      const tie = y === 8 && x >= width - 5 && opening > 0.85;
      const color = tie ? "o" : edge ? "h" : fold < 2 ? "v" : fold < 5 ? "c" : "d";
      pixels[y][x] = color;
      pixels[y][WIDTH - x - 1] = color;
    }
  }
}

export function renderTheater(views, litSeats, opening, celebration, marker) {
  const pixels = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill("."));
  for (let y = 0; y <= 7; y++) {
    const edge = y === 0 || y === 7 ? 2 : 0;
    pixels[y].fill(y === 0 || y === 7 ? "+" : "s", 15 + edge, 57 - edge);
    if (!edge) {
      pixels[y][15] = "b";
      pixels[y][56] = "b";
    }
  }
  putText(pixels, compact(views), 1, views == null ? "+" : "w");
  for (let y = 8; y < HEIGHT; y++) {
    const aisle = 2 + Math.floor((y - 8) / 2);
    pixels[y].fill(y % 2 ? "." : "r", 36 - aisle, 36 + aisle);
  }
  for (let row = 0; row < ROWS.length; row++) {
    const { y, first, step, width } = ROWS[row];
    for (let seat = 0; seat < SEAT_ORDER.length; seat++) {
      const x = first + SEAT_ORDER[seat] * step;
      const lit = row * SEAT_ORDER.length + seat < litSeats;
      pixels[y].fill(lit ? "a" : "u", x, x + width);
      pixels[y + 1].fill(lit ? "o" : "r", x - 1, x + width + 1);
      pixels[y + 1][x + Math.floor(width / 2)] = lit ? "h" : "l";
    }
  }
  drawCurtains(pixels, opening);
  if (celebration >= 0) {
    const sparks = [[19, 2], [51, 2], [22, 5], [49, 4], [12, 11], [59, 10], [6, 13], [65, 14]];
    for (let i = 0; i < sparks.length; i++) {
      const [x, y] = sparks[i];
      if ((i + celebration) % 3 === 0) {
        pixels[y][x] = "w";
        pixels[y][x + 1] = "a";
        pixels[y + 1][x] = "a";
      }
    }
  }
  if (marker) {
    pixels[14][2] = marker;
    pixels[14][3] = marker;
    pixels[15][2] = marker;
  }
  return XPM_HEADER + pixels.map((row) => row.join("")).join("\n");
}
