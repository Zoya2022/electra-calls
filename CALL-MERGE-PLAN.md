# Call Merge Test — Implementation Plan

This branch is an isolated experiment. The production `main` branch is not modified.

## Required host experience

- Keep the existing one-to-one call flow and caller waiting queue intact as the baseline.
- When a second caller is waiting while Caller 1 is active, the host can accept Caller 2 without ending Caller 1.
- After accepting Caller 2, show three host modes:
  - Private: Caller 1 active; Caller 2 on hold with waiting music.
  - Private: Caller 2 active; Caller 1 on hold with waiting music.
  - Conference: host, Caller 1, and Caller 2 can all hear and speak to one another.
- A held caller remains connected. Hold music replaces the private conversation audio; the held caller's microphone must not leak into the active private conversation.
- When switching or merging, stop the hold music for the caller who is taken off hold.
- If either caller disconnects, the remaining call must continue.

## Proposed audio topology

Use a host-controlled Web Audio mix for each caller's downlink:
- Caller microphone streams arrive separately at the host.
- For each caller, construct an outgoing mix containing the host microphone plus only the other caller's microphone when in conference mode.
- In private mode, send the held caller a locally generated waiting-music stream instead of the conversation mix.
- In conference mode, each caller receives the host plus the other caller. The host hears both callers through separate local audio elements.
- Each caller keeps the existing bidirectional PeerJS MediaConnection. The host answers that same connection with a per-caller mixed downlink stream; caller-side code remains unchanged.

Use per-participant gain nodes to mute/restore caller audio in each mix. Avoid connecting a caller's own microphone back to them.

## Safety and staged testing

1. Build all changes only on `call-merge-test`.
2. Preserve the existing caller link, host identity, one-to-one call, accept/reject, cancellation, queue, and cleanup behavior.
3. Test one-to-one regression first.
4. Test second caller arrival and acceptance.
5. Test switching both directions with hold music.
6. Test three-way conference audio.
7. Test either caller leaving while the other remains connected.
8. Do not copy to `main` unless the user explicitly approves after testing.

## Important limitation

The experimental branch now contains the first integration of this design. Static JavaScript parsing and mocked audio-routing checks have passed; real browser/WebRTC device testing is still required before this can be called test-ready.