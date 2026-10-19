// Run: node --experimental-strip-types src/sdp.check.ts
// Offer excerpt from a real Chrome 152 recvonly viewer (VP8 first, red after opus).
import { tuneRemoteOffer } from './sdp.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const offer = [
  'v=0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97 108 109 116 117 118 119 45 46 98 53',
  'a=rtpmap:96 VP8/90000',
  'a=rtpmap:97 rtx/90000',
  'a=fmtp:97 apt=96',
  'a=rtpmap:108 H264/90000',
  'a=fmtp:108 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  'a=rtpmap:109 rtx/90000',
  'a=fmtp:109 apt=108',
  'a=rtpmap:116 H264/90000',
  'a=fmtp:116 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d001f',
  'a=rtpmap:117 rtx/90000',
  'a=fmtp:117 apt=116',
  'a=rtpmap:118 H264/90000',
  'a=fmtp:118 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f',
  'a=rtpmap:119 rtx/90000',
  'a=fmtp:119 apt=118',
  'a=rtpmap:45 AV1/90000',
  'a=fmtp:45 level-idx=5;profile=0;tier=0',
  'a=rtpmap:46 rtx/90000',
  'a=fmtp:46 apt=45',
  'a=rtpmap:98 VP9/90000',
  'a=fmtp:98 profile-id=0',
  'a=rtpmap:53 flexfec-03/90000',
  'a=fmtp:53 repair-window=10000000',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:9 G722/8000',
  '',
].join('\r\n');

const mline = (sdp: string, kind: string) => sdp.split('\r\n').find((l) => l.startsWith(`m=${kind}`))!.split(' ').slice(3);

const h264 = tuneRemoteOffer(offer, 'h264', 1200);
assert(mline(h264, 'video')[0] === '118', 'h264: High profile first');
assert(mline(h264, 'video').slice(0, 3).join() === '118,116,108', 'h264: High > Main > Constrained Baseline');
assert(mline(h264, 'video').indexOf('96') > mline(h264, 'video').indexOf('45'), 'h264: VP8 after AV1');
assert(mline(h264, 'audio').slice(0, 2).join() === '63,111', 'red before opus');
assert(h264.includes('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=96000\r\n'), 'opus params');
assert(h264.includes('profile-level-id=64001f;x-google-start-bitrate=1200\r\n'), 'start bitrate on H.264');
assert(h264.includes('a=fmtp:97 apt=96\r\n'), 'rtx fmtp untouched');
assert(h264.includes('a=fmtp:53 repair-window=10000000\r\n'), 'flexfec fmtp untouched');
assert(h264.includes('a=fmtp:63 111/111\r\n'), 'red fmtp untouched');
assert(h264.split('\r\n').length === offer.split('\r\n').length, 'no lines added or lost');
assert(mline(h264, 'video').length === mline(offer, 'video').length, 'no payload types lost');

const av1 = tuneRemoteOffer(offer, 'av1_vp9', 1200);
assert(mline(av1, 'video').slice(0, 2).join() === '45,98', 'av1_vp9: AV1 then VP9');
assert(mline(av1, 'video')[2] === '118', 'av1_vp9: then H.264 High');

// Constrained High (640c1f) must still beat Constrained Baseline
const constrainedHigh = offer.replace('profile-level-id=64001f', 'profile-level-id=640c1f');
assert(mline(tuneRemoteOffer(constrainedHigh, 'h264', 1200), 'video')[0] === '118', 'h264: Constrained High first');

const lf = tuneRemoteOffer(offer.replace(/\r\n/g, '\n'), 'h264', 1200);
assert(!lf.includes('\r'), 'keeps LF line endings');

console.log('sdp checks ok');
