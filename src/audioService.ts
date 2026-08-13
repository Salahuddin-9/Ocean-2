/**
 * Turtle Social Media Application - Audio Synthesizer Engine (AudioService)
 * 
 * A zero-dependency audio sound synthesis engine generating dynamic chimes
 * programmatically using the raw browser Web Audio API (AudioContext).
 */

export class AudioService {
  private static audioCtx: AudioContext | null = null;

  /**
   * Lazily retrieve or create the browser's AudioContext.
   * AudioContexts must be initialized inside a user-interaction callback.
   */
  public static getContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume context if suspended (common browser security constraint)
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Play the Rising Chime Alert:
   * Synthesizes a staggered, four-note rising major chord using sine-wave oscillators (sine):
   * - C4 (261.63 Hz) at t = 0s
   * - E4 (329.63 Hz) at t = 0.15s
   * - G4 (392.00 Hz) at t = 0.30s
   * - C5 (523.25 Hz) at t = 0.45s
   * 
   * Controls progression times via scheduled gain nodes utilizing linear ramp curves
   * (linearRampToValueAtTime up to 0.2) and exponential decays (exponentialRampToValueAtTime down to 0.0001 over 0.6s).
   */
  public static playRisingChime(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const notes = [
        { freq: 261.63, delay: 0.0 },  // C4
        { freq: 329.63, delay: 0.15 }, // E4
        { freq: 392.00, delay: 0.30 }, // G4
        { freq: 523.25, delay: 0.45 }  // C5
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.delay);

        // Control progression times using scheduled gain nodes
        // 1. Start silence at delay time
        gainNode.gain.setValueAtTime(0, now + note.delay);
        // 2. Linear ramp up to 0.2 over 0.05s
        gainNode.gain.linearRampToValueAtTime(0.2, now + note.delay + 0.05);
        // 3. Exponential decay down to 0.0001 over 0.6s
        gainNode.gain.setValueAtTime(0.2, now + note.delay + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + 0.65);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + note.delay);
        osc.stop(now + note.delay + 0.7);
      });
    } catch (error) {
      console.warn("Rising Chime audio synthesis failed:", error);
    }
  }

  /**
   * Play the Pleasant Ring Message Alert:
   * Generates a dual-pitch pleasant message alert:
   * - A4 (440.00 Hz) at t = 0s
   * - A5 (880.00 Hz) at t = 0.15s
   * 
   * Utilizing an envelope decay of 0.45s.
   */
  public static playPleasantRing(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const notes = [
        { freq: 440.00, delay: 0.0 }, // A4
        { freq: 880.00, delay: 0.15 } // A5
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.delay);

        // Linear ramp up quickly to avoid pop, then envelope decay of 0.45s
        gainNode.gain.setValueAtTime(0, now + note.delay);
        gainNode.gain.linearRampToValueAtTime(0.2, now + note.delay + 0.02);
        gainNode.gain.setValueAtTime(0.2, now + note.delay + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + 0.47); // 0.02 + 0.45s decay

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + note.delay);
        osc.stop(now + note.delay + 0.5);
      });
    } catch (error) {
      console.warn("Pleasant Ring audio synthesis failed:", error);
    }
  }
}
