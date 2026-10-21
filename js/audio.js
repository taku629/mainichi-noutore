import { state } from './store.js';

/* ================= 効果音 ================= */
let audioCtx = null;
export function beep(freq, dur, type) {
  if (state.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* 無音でも動作 */ }
}
export const sndOK = () => { beep(880, .15); setTimeout(() => beep(1174, .18), 80); };
export const sndNG = () => beep(200, .22, 'triangle');
export const sndTap = () => beep(620, .06);
export const sndDone = () => { beep(659, .13); setTimeout(() => beep(784, .13), 130); setTimeout(() => beep(1047, .26), 260); };
