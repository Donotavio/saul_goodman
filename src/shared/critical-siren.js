(function () {
  class CriticalSirenPlayer {
    constructor() {
      this.context = null;
      this.timeoutId = null;
      this.active = false;
    }

    async playBursts(repeats = 3) {
      if (typeof AudioContext === 'undefined') {
        return;
      }

      if (!this.context) {
        this.context = new AudioContext();
      }

      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.active = true;
      let count = 0;

      const trigger = () => {
        if (!this.active || !this.context) {
          return;
        }
        this.playSingleBurst();
        count += 1;
        if (count < repeats) {
          this.timeoutId = setTimeout(trigger, 900);
        }
      };

      trigger();
    }

    stop() {
      this.active = false;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
    }

    playSingleBurst() {
      if (!this.context) {
        return;
      }
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 480;
      gain.gain.setValueAtTime(0.22, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.6);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + 0.6);
    }
  }

  const target = typeof window !== 'undefined' ? window : globalThis;
  target.CriticalSirenPlayer = CriticalSirenPlayer;
})();
