/**
 * Execution Formatter — turns Piston's response into Cognify's shape.
 *
 * Note: Piston reports the process exit status as `code`, not `exit_code`.
 * Normalizing here keeps that detail out of the frontend.
 */

/** Piston marks a wall-clock/CPU timeout with status "TO". */
function isTimeout(run) {
    return run?.status === 'TO' || /time limit exceeded/i.test(run?.message || '');
}

// Piston's run wrapper reports a cgroup OOM kill as a shell line that also
// leaks the sandbox path: "/piston/packages/python/3.12.0/run: line 3: 3 Killed ...".
const WRAPPER_KILLED = /^\/piston\/packages\/\S+: line \d+:\s+\d+ Killed\b.*$/m;

/** The per-job memory cgroup killed the process (SIGKILL -> exit 137). */
function isMemoryKill(run) {
    return run?.code === 137 && WRAPPER_KILLED.test(run?.stderr || '');
}

const MEMORY_MESSAGE = 'Memory limit exceeded — the program used more memory than the sandbox allows and was stopped.';

export function formatExecutionResult({ pistonResponse, runtime, executionId, durationMs }) {
    const run = pistonResponse?.run || {};
    const compile = pistonResponse?.compile || null;

    const timedOut = isTimeout(run);
    const memoryExceeded = !timedOut && isMemoryKill(run);
    const compileFailed = Boolean(compile && compile.code !== 0);

    // Compile errors belong in stderr — otherwise a failed build looks like
    // a silent no-op to the user.
    let stderr = run.stderr || '';
    if (compileFailed && compile.stderr) {
        stderr = stderr ? `${compile.stderr}\n${stderr}` : compile.stderr;
    }
    if (timedOut && !stderr) {
        stderr = run.message || 'Execution timed out.';
    }
    if (memoryExceeded) {
        stderr = stderr.replace(WRAPPER_KILLED, MEMORY_MESSAGE).trim();
    }

    return {
        executionId,
        language: pistonResponse?.language || runtime?.language || null,
        version: pistonResponse?.version || runtime?.version || null,
        run: {
            stdout: run.stdout || '',
            stderr,
            exitCode: run.code ?? null,
            signal: run.signal ?? null,
            timedOut,
            durationMs,
        },
        compile: compile
            ? { stdout: compile.stdout || '', stderr: compile.stderr || '', exitCode: compile.code ?? null }
            : null,
        status: timedOut
            ? 'timeout'
            : memoryExceeded
                ? 'memory_limit'
                : compileFailed
                    ? 'compile_error'
                    : 'completed',
    };
}
