/**
 * Keeps the stepped GPU draws of the test hooks behind the GPU (TASK-075).
 *
 * `kq.step` / `kq.press` draw synchronously, and Chromium does not pace those draws. A spec that
 * steps in a loop can queue GPU work much faster than software WebGL can process it (SwiftShader
 * on a hosted runner needs about a second per frame). While the GPU process is behind, the
 * renderer and browser processes grow by about 30 MB/s each until the runner runs out of memory.
 *
 * A stepped draw therefore runs only when the GPU has finished the previous one. That is a WebGL2
 * fence, and the browser updates its status between tasks, never within one. Otherwise the step
 * prepares the presentation and queues a paint. The animation-frame loop then draws it at the pace
 * the compositor allows. On a real GPU every step in its own task still draws. Within one task only
 * the first step draws, unless a caller asks for every draw (render measurements).
 */
export type FenceGl = Pick<
  WebGL2RenderingContext,
  'fenceSync' | 'getSyncParameter' | 'deleteSync' | 'flush' | 'isContextLost' | 'SYNC_GPU_COMMANDS_COMPLETE' | 'SYNC_STATUS' | 'SIGNALED'
>;

export class StepDrawGate {
  private fence: WebGLSync | null = null;

  constructor(private readonly gl: FenceGl | null) {}

  /** May a stepped draw run now (the GPU finished the previous stepped draw)? */
  ready(): boolean {
    const { gl, fence } = this;
    if (!gl || !fence) return true;
    if (gl.isContextLost()) {
      this.fence = null;
      return true;
    }
    if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
    gl.deleteSync(fence);
    this.fence = null;
    return true;
  }

  /** A stepped draw was issued: fence it, so the next step can tell when the GPU is done. */
  drew(): void {
    const { gl } = this;
    if (!gl || gl.isContextLost()) return;
    if (this.fence) gl.deleteSync(this.fence);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    // send the fence to the GPU process now; the next task can then see it signal
    gl.flush();
  }
}
