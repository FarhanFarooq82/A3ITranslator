import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isVisible: boolean;
  analyserNode?: AnalyserNode | null;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isVisible, analyserNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    // Clean up any previous resources
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }

    if (!isVisible) return;

    // If an external analyserNode is provided, use it
    if (analyserNode) {
      analyserRef.current = analyserNode;
    } else if (stream) {
      // Otherwise, create our own if we have a stream
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;
        source.connect(analyser);
      } catch (error) {
        console.error('Error initializing audio visualizer:', error);
        return;
      }
    } else {
      // No stream and no analyser, can't visualize
      return;
    }    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure we have a valid analyser to visualize
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      if (!canvas || !ctx || !analyser) return;
      
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(${barHeight + 100},50,150)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
      animationRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      
      // Only disconnect and close if we created our own context and source
      if (audioContextRef.current && sourceRef.current && !analyserNode) {
        if (sourceRef.current) sourceRef.current.disconnect();
        if (analyserRef.current) analyserRef.current.disconnect();
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      }
    };
  }, [stream, isVisible, analyserNode]);

  if (!isVisible) return null;
  return (
    <div className="w-full flex justify-center my-4">
      <canvas ref={canvasRef} width={280} height={60} style={{ background: '#222', borderRadius: 8, maxWidth: '100%' }} />
    </div>
  );
};

export default AudioVisualizer;
