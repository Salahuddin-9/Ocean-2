// High Fidelity Web Audio Ringtone and Ringback Tones Synthesizer for sandboxed environments
// No external assets required. Completely error-safe.

let audioCtx: AudioContext | null = null;
let activeInterval: any = null;
let activeOscillators: { osc: OscillatorNode; gain: GainNode }[] = [];

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function stopAllTones() {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
  activeOscillators.forEach(({ osc, gain }) => {
    try {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    } catch (e) {}
  });
  activeOscillators = [];
}

// 1. Outgoing call ringback sound ("beeeep... pause... beeeep...")
export function playOutgoingRingback() {
  stopAllTones();
  const ctx = getAudioContext();
  
  const playToneCycle = () => {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.frequency.value = 440; // US standard ringback
    osc2.frequency.value = 480;

    osc1.type = "sine";
    osc2.type = "sine";

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.12, ctx.currentTime + 1.8);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();

    // Store reference to abort if cancelled
    const entry = { osc: osc1, gain: gainNode };
    const entry2 = { osc: osc2, gain: gainNode };
    activeOscillators.push(entry, entry2);

    setTimeout(() => {
      try {
        osc1.stop();
        osc2.stop();
        osc1.disconnect();
        osc2.disconnect();
        gainNode.disconnect();
      } catch (e) {}
      activeOscillators = activeOscillators.filter(item => item.osc !== osc1 && item.osc !== osc2);
    }, 2100);
  };

  playToneCycle();
  activeInterval = setInterval(playToneCycle, 4000); // 2 sec sound, 2 sec silence
}

// 2. Incoming call electronic ringtone chime (Beautiful synthetic digital marimba ring)
export function playIncomingRingtone() {
  stopAllTones();
  const ctx = getAudioContext();

  const playChimeCycle = () => {
    const notes = [
      { f: 523.25, time: 0 },    // C5
      { f: 587.33, time: 0.14 }, // D5
      { f: 659.25, time: 0.28 }, // E5
      { f: 783.99, time: 0.42 }, // G5
      { f: 880.00, time: 0.56 }, // A5
      { f: 987.77, time: 0.70 }, // B5
      { f: 1046.50, time: 0.84 } // C6
    ];

    notes.forEach((note) => {
      const startTime = ctx.currentTime + note.time;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.f, startTime);

      // Smooth decay like physical wooden bars / glass chimes
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.65);

      const entry = { osc, gain: gainNode };
      activeOscillators.push(entry);

      setTimeout(() => {
        try {
          osc.disconnect();
          gainNode.disconnect();
        } catch (e) {}
        activeOscillators = activeOscillators.filter(item => item.osc !== osc);
      }, (note.time + 0.8) * 1000);
    });
  };

  playChimeCycle();
  // Double cycle repeat pattern
  activeInterval = setInterval(() => {
    playChimeCycle();
  }, 2500);
}
