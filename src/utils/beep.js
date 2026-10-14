// Short scanner-style beep so the cashier hears each scan without looking
// at the screen. A low tone signals an error. Silently does nothing if audio
// isn't available.
let ctx;

export const beep = (ok = true) => {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = ok ? 1800 : 300;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    // no audio — ignore
  }
};
