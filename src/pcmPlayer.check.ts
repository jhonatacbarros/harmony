// Run: node --experimental-strip-types src/pcmPlayer.check.ts
// Drives public/pcm-player.worklet.js outside the browser with stubbed worklet globals.
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

let Player: any;
(globalThis as any).AudioWorkletProcessor = class { port: any = {}; };
(globalThis as any).registerProcessor = (_name: string, cls: any) => { Player = cls; };
// @ts-expect-error plain JS worklet, no types
await import('../public/pcm-player.worklet.js');
export {};

const BLOCK = 128;
const chunk = (frames: number, start: number) => {
  const d = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) d[i * 2] = d[i * 2 + 1] = start + i;
  return d.buffer;
};
const run = (p: any) => {
  const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  p.process([], [out]);
  return out[0];
};

// Pre-buffer: silent until 60 ms queued, then plays the ramp in order (first block fades in)
const p = new Player();
p.port.onmessage({ data: chunk(960, 0) });
assert(run(p).every((v) => v === 0), 'silent while pre-buffering');
for (let c = 1; c < 3; c++) p.port.onmessage({ data: chunk(960, c * 960) });
const first = run(p);
assert(first[0] === 0 && first[64] === 64 * (64 / BLOCK), 'fades in when playback starts');
const second = run(p);
assert(second[0] === 128 && second[127] === 255, 'continues exactly where the last block ended (no overlap/gap)');

// Normal 20 ms chunk saw-tooth stays inside the dead zone: no pitch bend at all
assert(p.rate() === 1, 'no rate correction within the dead zone');

// A 200 ms backlog drains gently: rate above 1 but never past +0.3%
const q = new Player();
q.port.onmessage({ data: chunk(9600, 0) });
assert(q.rate() > 1 && q.rate() <= 1.003, 'catch-up rate is small and capped');
run(q);
const before = q.fill;
run(q);
const used = before - q.fill;
assert(used === 128 || used === 129, 'consumes ~one block per block while catching up');

// A huge backlog (long stall) jumps straight back to the target
const h = new Player();
h.port.onmessage({ data: chunk(30000, 0) });
run(h);
assert(h.fill <= 2880 && h.fill >= 2880 - 129, 'hard limit snaps backlog to the target');

// Exactly one block left: plays it fully, no spurious underrun
const x = new Player();
x.primed = true;
x.port.onmessage({ data: chunk(128, 5) });
const exact = run(x);
assert(x.primed && exact[127] !== 0, 'exact fill is not an underrun');

// Underrun mid-block: ramps to silence (no hard cut) and re-primes
const u = new Player();
u.port.onmessage({ data: chunk(2880, 1000) });
for (let i = 0; i < 22; i++) run(u);
const tail = run(u);
const firstSilent = tail.findIndex((v) => v === 0);
assert(firstSilent > 0 && tail[firstSilent - 1] < tail[firstSilent - 2], 'underrun ramps down instead of cutting');
assert(!u.primed, 'underrun re-primes');

console.log('pcmPlayer.check: ok');
