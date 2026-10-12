import { profileOpen } from '../src/sim/chord';
const C = Array.from({ length: 316 }, (_, i) => ({ x: i * 5, y: 0, z: 0 }));
const Y = profileOpen(C, (x) => 10 * Math.sin(x / 300), 5, [145], [-9.8, -1.0], 0.02, 36, 250);
console.log(Y.slice(100, 200).map(v => v.toFixed(1)).join(' '));
let m = 0, at = 0; for (let i = 0; i + 1 < Y.length; i++) if (Math.abs(Y[i + 1] - Y[i]) > m) { m = Math.abs(Y[i + 1] - Y[i]); at = i; } console.log(m, at);
