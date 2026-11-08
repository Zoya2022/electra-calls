/* Electra Explains — isolated conference audio engine prototype.
 * Loaded only by the call-merge test page when integration is ready.
 * Does not alter the production one-to-one calling path by itself.
 */
(() => {
  'use strict';

  class ElectraConferenceAudio {
    constructor(hostStream) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');

      this.context = new AudioContextClass();
      this.hostStream = hostStream;
      this.hostSource = this.context.createMediaStreamSource(hostStream);
      this.participants = new Map();
      this.outputs = new Map();
      this.mode = 'private-1';
      this.disposed = false;
    }

    async resume() {
      if (this.context.state === 'suspended') await this.context.resume();
    }

    addParticipant(id, stream) {
      if (this.participants.has(id)) this.removeParticipant(id);
      const source = this.context.createMediaStreamSource(stream);
      const participant = { stream, source, outputs: new Map() };
      this.participants.set(id, participant);
      this.outputs.forEach((output, targetId) => this._connectParticipantToOutput(id, targetId, output));
      this._applyMode();
    }

    removeParticipant(id) {
      const participant = this.participants.get(id);
      if (!participant) return;
      for (const gain of participant.outputs.values()) {
        try { gain.disconnect(); } catch {}
      }
      try { participant.source.disconnect(); } catch {}
      this.participants.delete(id);
      this._applyMode();
    }

    _makeOutput(targetId) {
      const destination = this.context.createMediaStreamDestination();
      const hostGain = this.context.createGain();
      hostGain.gain.value = 1;
      this.hostSource.connect(hostGain);
      hostGain.connect(destination);

      const output = { destination, hostGain, participantGains: new Map(), hold: null };
      this.outputs.set(targetId, output);
      for (const participantId of this.participants.keys()) {
        this._connectParticipantToOutput(participantId, targetId, output);
      }
      return output;
    }

    _connectParticipantToOutput(participantId, targetId, output) {
      if (participantId === targetId || output.participantGains.has(participantId)) return;
      const participant = this.participants.get(participantId);
      if (!participant) return;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      participant.source.connect(gain);
      gain.connect(output.destination);
      output.participantGains.set(participantId, gain);
      participant.outputs.set(targetId, gain);
    }

    outputFor(targetId) {
      const output = this.outputs.get(targetId) || this._makeOutput(targetId);
      this._applyMode();
      return output.destination.stream;
    }

    setMode(mode) {
      if (!['private-1', 'private-2', 'conference'].includes(mode)) {
        throw new Error('Unknown conference mode.');
      }
      this.mode = mode;
      this._applyMode();
    }

    _applyMode() {
      for (const [targetId, output] of this.outputs) {
        const isHeld = (this.mode === 'private-1' && targetId === 'caller-2') ||
                       (this.mode === 'private-2' && targetId === 'caller-1');
        const isConference = this.mode === 'conference';
        output.hostGain.gain.setTargetAtTime(isHeld ? 0 : 1, this.context.currentTime, 0.025);

        for (const [participantId, gain] of output.participantGains) {
          const include = isConference && participantId !== targetId;
          gain.gain.setTargetAtTime(include ? 1 : 0, this.context.currentTime, 0.025);
        }
        if (isHeld) this._startHoldMusic(output);
        else this._stopHoldMusic(output);
      }
    }

    _startHoldMusic(output) {
      if (output.hold) return;
      const destination = this.context.createMediaStreamDestination();
      const master = this.context.createGain();
      master.gain.value = 0.035;
      master.connect(destination);

      // Original, softly pulsing two-note ambient waiting tone; no external
      // audio asset or copyrighted recording is used.
      const notes = [392, 523.25, 440, 587.33];
      const oscillators = notes.map((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const noteGain = this.context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        noteGain.gain.value = index % 2 ? 0.16 : 0.1;
        oscillator.connect(noteGain);
        noteGain.connect(master);
        oscillator.start();
        return oscillator;
      });
      const holdSource = this.context.createMediaStreamSource(destination.stream);
      holdSource.connect(output.destination);
      output.hold = { oscillators, holdSource, master, destination };
    }

    _stopHoldMusic(output) {
      if (!output.hold) return;
      for (const oscillator of output.hold.oscillators) {
        try { oscillator.stop(); oscillator.disconnect(); } catch {}
      }
      try { output.hold.holdSource.disconnect(); } catch {}
      try { output.hold.master.disconnect(); } catch {}
      output.hold = null;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const output of this.outputs.values()) {
        this._stopHoldMusic(output);
        try { output.hostGain.disconnect(); } catch {}
        for (const gain of output.participantGains.values()) {
          try { gain.disconnect(); } catch {}
        }
      }
      for (const participant of this.participants.values()) {
        try { participant.source.disconnect(); } catch {}
      }
      try { this.hostSource.disconnect(); } catch {}
      this.outputs.clear();
      this.participants.clear();
      this.context.close().catch(() => {});
    }
  }

  window.ElectraConferenceAudio = ElectraConferenceAudio;
})();