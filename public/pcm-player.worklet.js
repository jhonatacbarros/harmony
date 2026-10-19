// Plays interleaved stereo f32 PCM (48 kHz) posted to the node's port by the native
// Process Loopback socket. A ring buffer absorbs socket/main-thread jitter; drift
// between the WASAPI and AudioContext clocks is absorbed by reading slightly
// faster/slower (fractional read head), never by jumping the timeline.
const CAPACITY = 48000; // 1 s of frames
const TARGET = 2880; // 60 ms pre-buffer
// Chunks land 20 ms (960 frames) at a time, so fill saw-tooths around the target by
// that much on its own; only correct beyond it so normal jitter never bends pitch.
const DEAD_ZONE = 1440;
// Rate offset per frame of error beyond the dead zone, capped at 0.3% (~5 cents).
// 10 ms of excess -> 0.1%, inaudible; true clock drift is ~0.01%.
const GAIN = 0.001 / 480;
const MAX_RATE_OFFSET = 0.003;
// A backlog this deep (a long stall) would take minutes to drain smoothly: jump.
const HARD_LIMIT = 24000; // 500 ms

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CAPACITY * 2);
    this.read = 0;
    this.write = 0;
    this.fill = 0;
    this.frac = 0; // fractional read offset in [0, 1)
    this.primed = false;
    this.fadeIn = false;
    this.port.onmessage = (e) => this.push(new Float32Array(e.data));
  }

  push(data) {
    for (let i = 0; i + 1 < data.length; i += 2) {
      if (this.fill === CAPACITY) {
        // Overflow: drop the oldest frame rather than the newest
        this.read = (this.read + 1) % CAPACITY;
        this.fill--;
      }
      this.buf[this.write * 2] = data[i];
      this.buf[this.write * 2 + 1] = data[i + 1];
      this.write = (this.write + 1) % CAPACITY;
      this.fill++;
    }
  }

  rate() {
    const err = this.fill - TARGET;
    const excess = Math.abs(err) - DEAD_ZONE;
    if (excess <= 0) return 1;
    return 1 + Math.sign(err) * Math.min(excess * GAIN, MAX_RATE_OFFSET);
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    const n = left.length;

    if (!this.primed) {
      if (this.fill < TARGET) return true; // outputs stay zeroed
      this.primed = true;
      this.fadeIn = true;
      this.frac = 0;
    }

    if (this.fill > HARD_LIMIT) {
      const skip = this.fill - TARGET;
      this.read = (this.read + skip) % CAPACITY;
      this.fill = TARGET;
      this.fadeIn = true; // the jump is a discontinuity; ramp over it
    }

    // No allocations in this loop: GC pauses on the audio thread are glitches.
    const buf = this.buf;
    const rate = this.rate();
    let pos = this.frac;
    let lastL = 0;
    let lastR = 0;
    let i = 0;
    for (; i < n; i++) {
      const k = Math.floor(pos);
      if (k >= this.fill) break; // ran dry mid-block
      const t = pos - k;
      const a = ((this.read + k) % CAPACITY) * 2;
      // Last buffered frame: no right neighbour yet, hold it instead of reading garbage
      const b = k + 1 < this.fill ? ((this.read + k + 1) % CAPACITY) * 2 : a;
      const g = this.fadeIn ? i / n : 1;
      lastL = (buf[a] + (buf[b] - buf[a]) * t) * g;
      lastR = (buf[a + 1] + (buf[b + 1] - buf[a + 1]) * t) * g;
      left[i] = lastL;
      if (right) right[i] = lastR;
      pos += rate;
    }
    this.fadeIn = false;

    const consumed = Math.min(Math.floor(pos), this.fill);
    this.read = (this.read + consumed) % CAPACITY;
    this.fill -= consumed;
    this.frac = pos - Math.floor(pos);

    if (i < n) {
      // Underrun: ramp the last sample down to silence (a hard cut clicks) and re-prime
      const ramp = Math.min(64, n - i);
      for (let j = 0; j < ramp; j++) {
        const g = 1 - (j + 1) / ramp;
        left[i + j] = lastL * g;
        if (right) right[i + j] = lastR * g;
      }
      this.primed = false;
    }
    return true;
  }
}

registerProcessor('pcm-player', PcmPlayer);
