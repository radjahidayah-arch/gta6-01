// All sound is synthesised with WebAudio — no audio files. Engine hum is a pair
// of oscillators whose pitch follows speed; sirens are two alternating tones;
// gunshots, crashes and pickups are short noise or tone bursts. Everything is
// guarded so a browser without audio (or a headless screenshot run) never breaks.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture; browsers only allow audio after one. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(duration);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      source.stop(ctx.currentTime + duration);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    /** Engine hum that follows the car's speed (0..1). Call every frame while driving. */
    engine(speedRatio, on) {
      if (!ensure()) return;
      try {
        if (!on) {
          if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          return;
        }
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineOsc2 = ctx.createOscillator();
          engineOsc2.type = 'square';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          engineOsc.connect(filter);
          engineOsc2.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
          engineOsc2.start();
        }
        const freq = 55 + speedRatio * 140;
        engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
        engineOsc2.frequency.setTargetAtTime(freq * 0.5, ctx.currentTime, 0.05);
        engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.06, ctx.currentTime, 0.08);
      } catch {
        // Ignore audio errors.
      }
    },

    /** Police siren, on while any police car is close. */
    siren(on, dt) {
      if (!ensure()) return;
      try {
        if (!on) {
          if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          return;
        }
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'triangle';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
        }
        sirenTimer += dt;
        const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
        sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, ctx.currentTime, 0.03);
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
      } catch {
        // Ignore audio errors.
      }
    },

    shot() { burst(0.14, 1800, 0.5, 'highpass'); },
    punch() { burst(0.08, 500, 0.35); },
    crash(strength = 1) { burst(0.22, 320, Math.min(0.7, 0.25 + strength * 0.4)); },
    skid() { burst(0.18, 900, 0.12, 'bandpass'); },
    pickup() { tone(660, 0.1, 0.25); tone(990, 0.16, 0.25); },
    missionDone() { tone(523, 0.12, 0.3); setTimeout(() => tone(659, 0.12, 0.3), 110); setTimeout(() => tone(784, 0.22, 0.3), 220); },
    busted() { tone(220, 0.5, 0.3, 'sawtooth', 110); },
    click() { tone(1200, 0.05, 0.15, 'square'); },
  };
}
