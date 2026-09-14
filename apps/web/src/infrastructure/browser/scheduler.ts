import type { Scheduler } from "@/application/editor/ports";

/** Real time, through the host's timers. */
export const timerScheduler: Scheduler = {
  schedule(ms, run) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};
