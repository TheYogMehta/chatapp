class CallProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0][0]; // first channel
    if (!input) return true;

    // convert Float32 to Int16
    const int16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) int16[i] = input[i] * 0x7fff;

    // send PCM to main thread
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor("call-processor", CallProcessor);
