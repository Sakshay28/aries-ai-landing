import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (percent: number) => void;
}

/**
 * Custom hook to control audio playback of audio Blobs or URLs with time and progress tracking.
 * 
 * @param {Blob | string | null} source - The audio Blob or URL string to play.
 * @returns {UseAudioPlaybackReturn} Playback controls and progress states.
 */
export function useAudioPlayback(source: Blob | string | null): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceUrlRef = useRef<string | null>(null);

  // Set up audio source URL
  useEffect(() => {
    if (!source) {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
      return;
    }

    let url = '';
    if (source instanceof Blob) {
      url = URL.createObjectURL(source);
      sourceUrlRef.current = url;
    } else {
      url = source;
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      if (sourceUrlRef.current) {
        URL.revokeObjectURL(sourceUrlRef.current);
        sourceUrlRef.current = null;
      }
      audioRef.current = null;
    };
  }, [source]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(console.error);
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback((percent: number) => {
    if (audioRef.current && duration) {
      const targetTime = (percent / 100) * duration;
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      setProgress(percent);
    }
  }, [duration]);

  return {
    isPlaying,
    currentTime,
    duration,
    progress,
    play,
    pause,
    toggle,
    seek
  };
}
