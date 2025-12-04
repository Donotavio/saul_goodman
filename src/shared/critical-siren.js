(function () {
  class CriticalSirenPlayer {
    constructor() {
      this.audio = null;
      this.endedHandler = null;
      this.enabled = true;
    }

    getSirenUrl() {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        return chrome.runtime.getURL('store-assets/audio/Voicy_Better Call Saul intro.aac');
      }
      return 'store-assets/audio/Voicy_Better Call Saul intro.aac';
    }

    ensureAudio() {
      if (this.audio) return;
      try {
        this.audio = new Audio(this.getSirenUrl());
        this.audio.preload = 'auto';
        this.audio.volume = 0.9;
      } catch (error) {
        console.warn('Saul sirene indisponível (Audio bloqueado):', error);
        this.enabled = false;
      }
    }

    playBursts(repeats = 1) {
      if (!this.enabled) return;
      this.ensureAudio();
      if (!this.audio) return;

      this.stop();
      let count = 0;

      const playOnce = () => {
        if (!this.audio || !this.enabled) return;
        this.audio.currentTime = 0;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((error) => {
            console.warn('Saul sirene não pôde tocar:', error);
            this.enabled = false;
          });
        }
      };

      this.endedHandler = () => {
        count += 1;
        if (count < repeats) {
          playOnce();
        } else {
          this.stop();
        }
      };

      this.audio.addEventListener('ended', this.endedHandler);
      playOnce();
    }

    stop() {
      if (this.audio) {
        if (this.endedHandler) {
          this.audio.removeEventListener('ended', this.endedHandler);
          this.endedHandler = null;
        }
        this.audio.pause();
        this.audio.currentTime = 0;
      }
    }
  }

  const target = typeof window !== 'undefined' ? window : globalThis;
  target.CriticalSirenPlayer = CriticalSirenPlayer;
})();
