// libwebrtc derives the *send* codec and its params (fmtp, x-google-*) from the
// remote description. The host is the answerer, so the viewer's offer is what
// decides what the host encodes: setCodecPreferences on the host is ignored for
// sending (verified: host preferring H.264 still sent VP8, Chrome 152).

export type CodecPreference = 'h264' | 'av1_vp9';

interface PayloadInfo {
  codec: string; // lowercased rtpmap name: h264, vp8, vp9, av1, opus, red, rtx...
  fmtp: string;
}

function h264Rank(fmtp: string): number {
  if (!fmtp.includes('packetization-mode=1')) return 5;
  // profile-level-id = profile_idc (2 hex) + constraint flags (2 hex) + level (2 hex).
  // Rank by profile_idc so constrained variants (e.g. Constrained High 640c1f)
  // land with their profile.
  const id = fmtp.match(/profile-level-id=([0-9a-f]{6})/i)?.[1].toLowerCase() ?? '';
  const idc = id.slice(0, 2);
  // Prefer High: NVIDIA's Media Foundation encoder refuses Constrained Baseline
  // and Chrome falls back to software OpenH264.
  if (idc === '64') return 0;
  if (idc === '4d') return 1;
  if (idc === '42') return parseInt(id.slice(2, 4), 16) & 0x40 ? 2 : 3; // constraint_set1 = Constrained Baseline
  return 4; // e.g. High 4:4:4 (f4): poor decoder support
}

function videoRank(info: PayloadInfo, pref: CodecPreference): number {
  const h264 = info.codec === 'h264' ? h264Rank(info.fmtp) : -1;
  const vp9 = info.codec === 'vp9' ? (info.fmtp.includes('profile-id=0') || !info.fmtp ? 0 : 1) : -1;
  if (pref === 'av1_vp9') {
    if (info.codec === 'av1') return 0;
    if (vp9 >= 0) return 1 + vp9;
    if (h264 >= 0) return 3 + h264;
    if (info.codec === 'vp8') return 9;
  } else {
    if (h264 >= 0) return h264;
    if (info.codec === 'vp9') return 6 + Math.max(vp9, 0);
    if (info.codec === 'av1') return 8;
    if (info.codec === 'vp8') return 9;
  }
  return 10; // rtx, red, ulpfec, flexfec: never picked as the send codec
}

function audioRank(info: PayloadInfo): number {
  // RED before opus turns on audio redundancy (Chrome only sends RED when it
  // precedes opus in the negotiated list).
  if (info.codec === 'red') return 0;
  if (info.codec === 'opus') return 1;
  return 2;
}

const PRIMARY_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);

export function tuneRemoteOffer(sdp: string, pref: CodecPreference, startKbps: number): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(/\r\n|\n/);

  // Split into the session header and one block per m= section
  const sections: string[][] = [[]];
  for (const line of lines) {
    if (line.startsWith('m=')) sections.push([]);
    sections[sections.length - 1].push(line);
  }

  for (const section of sections) {
    const kind = section[0]?.match(/^m=(audio|video) /)?.[1];
    if (!kind) continue;

    const payloads = new Map<string, PayloadInfo>();
    for (const line of section) {
      const rtpmap = line.match(/^a=rtpmap:(\d+) ([^/]+)\//);
      if (rtpmap) payloads.set(rtpmap[1], { codec: rtpmap[2].toLowerCase(), fmtp: '' });
    }
    for (const line of section) {
      const fmtp = line.match(/^a=fmtp:(\d+) (.*)$/);
      const info = fmtp && payloads.get(fmtp[1]);
      if (info) info.fmtp = fmtp![2];
    }

    const rank = (pt: string) => {
      const info = payloads.get(pt);
      if (!info) return 10;
      return kind === 'video' ? videoRank(info, pref) : audioRank(info);
    };
    const mline = section[0].split(' ');
    const ordered = mline.slice(3).sort((a, b) => rank(a) - rank(b)); // stable sort
    section[0] = [...mline.slice(0, 3), ...ordered].join(' ');

    for (let i = 1; i < section.length; i++) {
      const fmtp = section[i].match(/^a=fmtp:(\d+) (.*)$/);
      const info = fmtp && payloads.get(fmtp[1]);
      if (!fmtp || !info) continue;

      if (kind === 'audio' && info.codec === 'opus') {
        // Opus params are receiver-declared (RFC 7587). 96k stereo like Moonlight:
        // RED doubles it on the wire (~192 kbps measured with RED on).
        section[i] = `a=fmtp:${fmtp[1]} minptime=10;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=96000`;
      } else if (kind === 'video' && PRIMARY_VIDEO.has(info.codec)) {
        // Start the bandwidth estimate near a usable rate instead of 300 kbps.
        // No min/max here: maxBitrate is set via setParameters, and a floor would
        // stop congestion control from backing off on a bad link.
        const params = fmtp[2].split(';').filter((p) => !p.trim().startsWith('x-google-'));
        params.push(`x-google-start-bitrate=${startKbps}`);
        section[i] = `a=fmtp:${fmtp[1]} ${params.join(';')}`;
      }
    }
  }

  return sections.flat().join(eol);
}
