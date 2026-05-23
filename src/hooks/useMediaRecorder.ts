import { useState, useRef, useEffect, useCallback } from 'react';

interface UseMediaRecorderReturn {
  isRecording: boolean;
  elapsedSeconds: number;
  waveformHeights: number[];
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  audioBlob: Blob | null;
}

/**
 * Plays a premium synthesizer chime to indicate recording states.
 */
const playChime = (type: 'start' | 'stop' | 'cancel') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'start') {
      // Warm double chime for start (C5 -> E5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.06);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc2.start(ctx.currentTime + 0.06);
      osc2.stop(ctx.currentTime + 0.2);
    } else if (type === 'stop') {
      // Gentle descending chime for stop (D5 -> A4)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440.00, ctx.currentTime + 0.05);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc2.start(ctx.currentTime + 0.05);
      osc2.stop(ctx.currentTime + 0.18);
    } else if (type === 'cancel') {
      // Soft sweep down for cancel
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220.00, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (err) {
    console.error('Failed to play sound chime:', err);
  }
};

/**
 * Custom hook to record audio using the MediaRecorder API and analyze live waveforms.
 * Supports a 5-minute maximum recording limit.
 * 
 * @param {Function} [onStopCallback] - Optional callback triggered with the final blob and duration when recording stops.
 * @returns {UseMediaRecorderReturn} Recording states, visualizer waveform heights, and controls.
 */
export function useMediaRecorder(
  onStopCallback?: (blob: Blob, duration: number) => void
): UseMediaRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(22).fill(4));
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      playChime('stop');
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    playChime('cancel');
    cleanup();
    setIsRecording(false);
    setElapsedSeconds(0);
    setWaveformHeights(Array(22).fill(4));
    setAudioBlob(null);
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    cleanup();
    setAudioBlob(null);
    setElapsedSeconds(0);
    durationRef.current = 0;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      // Set up real-time audio analysis using Web Audio API
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Realtime animation loop for 22 bars
      const updateWaveform = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Map analyser frequency bins to 22 vertical bars
        const newHeights = Array.from({ length: 22 }, (_, idx) => {
          const dataIdx = Math.floor((idx / 22) * bufferLength);
          const rawValue = dataArray[dataIdx] || 0;
          // Scale from 0-255 to min 4px and max 28px height
          return Math.max(4, Math.min(28, 4 + (rawValue / 255) * 24));
        });

        setWaveformHeights(newHeights);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(finalBlob);
        
        const finalDuration = durationRef.current;
        if (onStopCallback) {
          onStopCallback(finalBlob, finalDuration);
        }
        cleanup();
        setIsRecording(false);
      };

      // Start recording
      mediaRecorder.start(250); // Slice data every 250ms
      setIsRecording(true);
      updateWaveform();
      playChime('start');

      // Start duration timer (max 5 minutes = 300 seconds)
      let seconds = 0;
      timerIntervalRef.current = setInterval(() => {
        seconds += 1;
        durationRef.current = seconds;
        setElapsedSeconds(seconds);
        if (seconds >= 300) {
          stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('Failed to access microphone:', err);
      cleanup();
      setIsRecording(false);
      throw err;
    }
  }, [cleanup, stopRecording, onStopCallback]);

  // Clean up on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isRecording,
    elapsedSeconds,
    waveformHeights,
    startRecording,
    stopRecording,
    cancelRecording,
    audioBlob
  };
}
