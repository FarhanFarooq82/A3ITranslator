export class SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;
  private _isListening: boolean = false;

  setupRecognition(
    language: string,
    onStart: () => void,
    onResult: (transcript: string) => void,
    onError: (error: string) => void,
    onEnd: () => void
  ): void {
    console.log('Setting up recognition for language:', language); // Debug log

    if (!('webkitSpeechRecognition' in window)) {
      console.error('Web Speech API not supported'); // Debug log
      onError('Web Speech API is not supported in this browser.');
      return;
    }

    this.recognition = new webkitSpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;

    this.recognition.onstart = () => {
      console.log('Recognition service started'); // Debug log
      this._isListening = true;
      onStart();
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentTranscript += event.results[i][0].transcript;
        }
      }
      console.log('Recognition result:', currentTranscript); // Debug log
      onResult(currentTranscript);
    };    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Recognition error:', event.error); // Debug log
      if (event.error === 'no-speech') {
        onError('no-speech');
      } else {
        onError('Speech recognition error: ' + event.error);
      }
    };

    this.recognition.onend = () => {
      console.log('Recognition service ended'); // Debug log
      this._isListening = false;
      onEnd();
    };
  }

  start(): void {
    console.log('Starting recognition service'); // Debug log
    try {
      this.recognition?.start();
    } catch (error) {
      console.error('Error starting recognition:', error); // Debug log
    }
  }

  stop(): void {
    console.log('Stopping recognition service'); // Debug log
    this.recognition?.stop();
  }

  cleanup(): void {
    console.log('Cleaning up recognition service'); // Debug log
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
      this._isListening = false;
    }
  }

  isListening(): boolean {
    return this._isListening;
  }
}
