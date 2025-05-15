declare module 'opus-media-recorder' {
    export class OpusMediaRecorder extends MediaRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions);
    }
  }
  