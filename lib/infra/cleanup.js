const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

const createCleanupJob = ({ tasks, intervalMs, logger = console }) => {
  let timer = null;
  let consecutiveFailures = 0;
  let generation = 0;

  const runTasks = async () => {
    const failures = [];
    for (const { run, label } of tasks) {
      try {
        const removed = await run();
        if (removed > 0) logger.info(`Cleanup: removed ${removed} ${label}`);
      } catch (err) {
        failures.push(`${label}: ${err.message}`);
      }
    }
    if (failures.length > 0) throw new Error(failures.join("; "));
  };

  const scheduleNext = () => {
    const runGeneration = generation;
    const delay =
      consecutiveFailures === 0
        ? intervalMs
        : Math.min(intervalMs * Math.pow(2, consecutiveFailures), MAX_BACKOFF_MS);

    timer = setTimeout(async () => {
      let failure = null;
      try {
        await runTasks();
      } catch (err) {
        failure = err;
      }

      if (runGeneration !== generation) return;

      if (failure === null) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        logger.error(
          `Cleanup failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
          failure.message
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error(
            "CRITICAL: Cleanup job stopped after " +
              `${MAX_CONSECUTIVE_FAILURES} consecutive failures. ` +
              "Manual intervention required."
          );
          timer = null;
          return;
        }
      }

      scheduleNext();
    }, delay);

    timer.unref();
  };

  const start = () => {
    if (timer) return;
    consecutiveFailures = 0;
    scheduleNext();
  };

  const stop = () => {
    generation += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    consecutiveFailures = 0;
  };

  return { start, stop };
};

module.exports = { createCleanupJob };
