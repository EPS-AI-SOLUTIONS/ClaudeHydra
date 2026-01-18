import { useCallback, useEffect, useRef } from 'react';

// Sound effects using Web Audio API - Witcher-themed synthesized sounds
interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

const SOUNDS: Record<string, SoundConfig> = {
  // Click sound - short crisp tone
  click: {
    frequency: 800,
    duration: 0.08,
    type: 'sine',
    gain: 0.15,
    attack: 0.01,
    decay: 0.02,
  },
  // Toggle on - rising tone
  toggleOn: {
    frequency: 600,
    duration: 0.12,
    type: 'sine',
    gain: 0.18,
    attack: 0.02,
    decay: 0.04,
  },
  // Toggle off - falling tone
  toggleOff: {
    frequency: 400,
    duration: 0.1,
    type: 'sine',
    gain: 0.12,
    attack: 0.01,
    decay: 0.03,
  },
  // Success - triumphant chord
  success: {
    frequency: 523.25, // C5
    duration: 0.4,
    type: 'triangle',
    gain: 0.25,
    attack: 0.02,
    decay: 0.1,
  },
  // Error - low warning tone
  error: {
    frequency: 200,
    duration: 0.25,
    type: 'sawtooth',
    gain: 0.15,
    attack: 0.01,
    decay: 0.05,
  },
  // Message sent - whoosh
  messageSent: {
    frequency: 1000,
    duration: 0.15,
    type: 'sine',
    gain: 0.12,
    attack: 0.01,
    decay: 0.08,
  },
  // Message received - chime
  messageReceived: {
    frequency: 880,
    duration: 0.2,
    type: 'triangle',
    gain: 0.15,
    attack: 0.02,
    decay: 0.06,
  },
  // Progress tick - subtle click
  progressTick: {
    frequency: 1200,
    duration: 0.05,
    type: 'sine',
    gain: 0.08,
    attack: 0.005,
    decay: 0.02,
  },
  // Complete - Witcher medallion vibration (complex)
  complete: {
    frequency: 440,
    duration: 0.6,
    type: 'triangle',
    gain: 0.3,
    attack: 0.05,
    decay: 0.15,
  },
  // Hover - very subtle
  hover: {
    frequency: 1500,
    duration: 0.03,
    type: 'sine',
    gain: 0.05,
    attack: 0.005,
    decay: 0.01,
  },
  // Open panel - rising sweep
  openPanel: {
    frequency: 300,
    duration: 0.2,
    type: 'sine',
    gain: 0.12,
    attack: 0.02,
    decay: 0.08,
  },
  // Close panel - falling sweep
  closePanel: {
    frequency: 500,
    duration: 0.15,
    type: 'sine',
    gain: 0.1,
    attack: 0.01,
    decay: 0.06,
  },
};

export type SoundType = keyof typeof SOUNDS;

export const useSoundEffects = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isEnabledRef = useRef<boolean>(true);

  // Initialize audio context on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Check if sounds are enabled
  useEffect(() => {
    const checkEnabled = () => {
      const stored = localStorage.getItem('hydra_sound_effects');
      isEnabledRef.current = stored !== 'false';
    };

    checkEnabled();

    // Listen for storage changes
    const handleStorage = () => checkEnabled();
    window.addEventListener('storage', handleStorage);

    // Also listen for custom event (same-window changes)
    const handleCustom = () => checkEnabled();
    window.addEventListener('hydra-settings-change', handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('hydra-settings-change', handleCustom);
    };
  }, []);

  const playSound = useCallback((type: SoundType) => {
    // Check if enabled
    const stored = localStorage.getItem('hydra_sound_effects');
    if (stored === 'false') return;

    const config = SOUNDS[type];
    if (!config) return;

    try {
      const ctx = initAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);

      // Frequency sweep for certain sounds
      if (type === 'toggleOn') {
        oscillator.frequency.linearRampToValueAtTime(config.frequency * 1.5, ctx.currentTime + config.duration);
      } else if (type === 'toggleOff' || type === 'closePanel') {
        oscillator.frequency.linearRampToValueAtTime(config.frequency * 0.6, ctx.currentTime + config.duration);
      } else if (type === 'openPanel') {
        oscillator.frequency.linearRampToValueAtTime(config.frequency * 2, ctx.currentTime + config.duration);
      } else if (type === 'messageSent') {
        oscillator.frequency.linearRampToValueAtTime(config.frequency * 1.8, ctx.currentTime + config.duration * 0.5);
        oscillator.frequency.linearRampToValueAtTime(config.frequency * 0.5, ctx.currentTime + config.duration);
      }

      // ADSR envelope
      const attack = config.attack ?? 0.01;
      const decay = config.decay ?? 0.05;

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(config.gain, ctx.currentTime + attack);
      gainNode.gain.linearRampToValueAtTime(config.gain * 0.7, ctx.currentTime + attack + decay);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + config.duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + config.duration);

      // For complete sound, add harmonics
      if (type === 'complete' || type === 'success') {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(config.frequency * 1.5, ctx.currentTime);

        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.linearRampToValueAtTime(config.gain * 0.5, ctx.currentTime + attack);
        gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + config.duration);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + config.duration);

        // Third harmonic for complete
        if (type === 'complete') {
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();

          osc3.type = 'sine';
          osc3.frequency.setValueAtTime(config.frequency * 2, ctx.currentTime);

          gain3.gain.setValueAtTime(0, ctx.currentTime);
          gain3.gain.linearRampToValueAtTime(config.gain * 0.3, ctx.currentTime + attack * 2);
          gain3.gain.linearRampToValueAtTime(0, ctx.currentTime + config.duration);

          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start(ctx.currentTime + 0.1);
          osc3.stop(ctx.currentTime + config.duration);
        }
      }
    } catch (e) {
      console.warn('Sound effect error:', e);
    }
  }, [initAudioContext]);

  // Convenience methods
  const playClick = useCallback(() => playSound('click'), [playSound]);
  const playToggle = useCallback((isOn: boolean) => playSound(isOn ? 'toggleOn' : 'toggleOff'), [playSound]);
  const playSuccess = useCallback(() => playSound('success'), [playSound]);
  const playError = useCallback(() => playSound('error'), [playSound]);
  const playComplete = useCallback(() => playSound('complete'), [playSound]);
  const playMessageSent = useCallback(() => playSound('messageSent'), [playSound]);
  const playMessageReceived = useCallback(() => playSound('messageReceived'), [playSound]);
  const playOpenPanel = useCallback(() => playSound('openPanel'), [playSound]);
  const playClosePanel = useCallback(() => playSound('closePanel'), [playSound]);

  return {
    playSound,
    playClick,
    playToggle,
    playSuccess,
    playError,
    playComplete,
    playMessageSent,
    playMessageReceived,
    playOpenPanel,
    playClosePanel,
  };
};

export default useSoundEffects;
