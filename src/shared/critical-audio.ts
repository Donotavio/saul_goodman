export class CriticalSirenPlayer {
  private context: AudioContext | null = null;
  private timeoutId: number | null = null;
  private active = false;

  async playBursts(repeats = 3): Promise<void> {
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
        this.timeoutId = globalThis.setTimeout(trigger, 900);
      }
    };

    trigger();
  }

  stop(): void {
    this.active = false;
    if (this.timeoutId) {
      globalThis.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private playSingleBurst(): void {
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
