/** Host-controlled shared replay with control requests (#2205). */

export interface ReplayState {
  frame: number;
  playing: boolean;
  rate: number;
  controllerId: string;
  controlRequest?: string;
  durationFrames: number;
}

export class SharedReplayController {
  private state: ReplayState;

  constructor(hostId: string, durationFrames: number) {
    this.state = {
      frame: 0,
      playing: false,
      rate: 1,
      controllerId: hostId,
      durationFrames,
    };
  }

  snapshot(): ReplayState {
    return { ...this.state };
  }

  private assertControl(userId: string): void {
    if (this.state.controllerId !== userId) throw new Error('Only the controller can change replay');
  }

  play(userId: string): ReplayState {
    this.assertControl(userId);
    this.state.playing = true;
    return this.snapshot();
  }

  pause(userId: string): ReplayState {
    this.assertControl(userId);
    this.state.playing = false;
    return this.snapshot();
  }

  seek(userId: string, frame: number): ReplayState {
    this.assertControl(userId);
    if (!Number.isFinite(frame) || frame < 0 || frame > this.state.durationFrames) {
      throw new Error('Frame out of range');
    }
    this.state.frame = Math.floor(frame);
    return this.snapshot();
  }

  setRate(userId: string, rate: number): ReplayState {
    this.assertControl(userId);
    if (![0.1, 0.5, 1, 2, 4].includes(rate)) throw new Error('Unsupported playback rate');
    this.state.rate = rate;
    return this.snapshot();
  }

  requestControl(userId: string): ReplayState {
    this.state.controlRequest = userId;
    return this.snapshot();
  }

  grantControl(controllerId: string, userId: string): ReplayState {
    this.assertControl(controllerId);
    this.state.controllerId = userId;
    this.state.controlRequest = undefined;
    return this.snapshot();
  }

  /** Advance playback; deterministic and safe for sync tests. */
  tick(frames: number): ReplayState {
    if (!this.state.playing) return this.snapshot();
    this.state.frame = Math.min(this.state.durationFrames, this.state.frame + frames * this.state.rate);
    if (this.state.frame >= this.state.durationFrames) this.state.playing = false;
    return this.snapshot();
  }
}
