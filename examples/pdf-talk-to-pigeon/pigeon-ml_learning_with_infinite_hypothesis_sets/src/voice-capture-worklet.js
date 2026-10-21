/* Capture mono 16 kHz frames. Weighted averaging preserves time across input
 * rates (including 44.1 kHz). The connected output stays silent. */
class PigeonVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.weight = 0; this.sum = 0;
    this.frame = new Float32Array(320); this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i=0; i<channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += value * take; this.weight += take; remaining -= take;
        if (this.weight >= this.ratio - 1e-8) {
          this.frame[this.offset++] = this.sum / this.ratio;
          this.sum = this.weight = 0;
          if (this.offset === this.frame.length) {
            this.port.postMessage(this.frame, [this.frame.buffer]);
            this.frame = new Float32Array(320); this.offset = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('pigeon-voice-capture', PigeonVoiceCapture);
