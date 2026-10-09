---
name: isolated-runtime-verification
description: "Use to verify runtime behavior by executing it in isolation."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [verification, pty, sandbox, server, osc, terminal, process]
    related_skills: [evidence-led-repository-inspection, omp-headless-delegation]
---

# Isolated Runtime Verification

## When to Use

Use this class when a claim depends on how a server, TUI, or PTY-backed app behaves at runtime: "does this protocol work", "does the handler reach the API", "does the session survive a restart", "is this worth adopting". Reading source is not enough. Execute the path, observe the bytes or API state, and report only what you observed.

## Procedure

1. **Write down the observable first.** Name what the verdict depends on: parser output, raw PTY bytes, an API field, a test result, or a real producer emitting the sequence. A verdict needs each of these it depends on.

2. **Build with per-step exit codes.** Run each step as its own command and read its exit code. Do not chain install and build with `;` or a trailing pipe to a filter: the pipeline's exit code is the filter's, and a bundler that still succeeds prints "Build complete" after a failed install. Capture `${PIPESTATUS[0]}` if a pipe is unavoidable. Report the install status separately from the build status.

3. **Isolate the instance.** Give the test its own state directory (for example a `TTYM_HOME`-style variable), its own port, and its own working tree. Record the production listener's PID and port before starting, and confirm it is unchanged afterward. A shared state dir lets the test mutate the real instance's sessions.

4. **Start and health-check.** Start the server in the background, then call its health endpoint and `ss -ltn` for the port. A process that started but has no listener is not ready.

5. **Drive sessions through the server's HTTP API when the CLI refuses.** If a CLI command is blocked by a run guard, call the same HTTP endpoint the CLI calls, inside the isolated instance only. Do not edit state files to fake a session.

6. **Send control bytes from a file, not inline.** ESC (`\x1b`/`\033`), BEL, and ST get mangled by shell quoting and JSON escaping. Inline attempts typed the command text literally into the session. Write the payload to a file with escape tokens and send it with `scripts/pty_send.py`, which decodes `\033 \x1b \n \r \t \\` and posts `{"data": ...}`.

7. **Probe in a fresh shell, and capture query replies as raw bytes.** A shell that already received control sequences echoes them and its state drifts, so later readings are contaminated. Run probes in `bash --norc --noprofile` with `stty -echo`. A terminal emulator consumes query replies, so the rendered screen cannot show them. Read the reply from the program's stdin with a timeout and print it with `od -c`.

8. **Tear down by PID.** Send SIGTERM to the sandbox server's PID only, not its process group, unless the test needs a full kill. Then check `ss -ltn` for the port, `ps` for leftover holder or child processes, and confirm the production listener is still there. Killing only the server and confirming the session survives is itself a useful restart test.

9. **Run tests from the repository root.** Monorepo vitest/jest configs match include globs relative to the root. Running from a package directory prints "No test files found", which looks like a failure and is not evidence either way. Run the touched test files explicitly and report the count.

## Verdict rule: "is this worth applying"

Decide adoption only after all four are in hand, in this order:

1. Parser or unit cases with expected values, including malformed input.
2. End-to-end through the real transport (PTY, server, API field) in the isolated instance.
3. The existing test suite for the touched files, run from the root.
4. Evidence that real producers emit the protocol or feature. Check the actual tools in use, not the spec.

If 1 to 3 pass and 4 is missing, report "the mechanism works; value is unknown" and do not recommend adoption. Mechanism-works and worth-it are different claims.

## Pitfalls

- **Report a build as successful only after each step's own exit code is 0.** A dependency install failure can coexist with a successful bundle. A wrong success claim costs the user a re-check.
- **Treat a log's verdict line as a claim, not a result.** An agent log saying "limited" or "pass" carries no evidence unless you can see the observation behind it. Re-run the observation.
- **Do not read a shell as a terminal oracle after control sequences were sent to it.** Use a fresh shell for each probe.
- **Keep the isolated instance off the production port and state dir.** Verify both before and after the run.
- **Remove sandbox processes when done** and say what was removed; a leftover server holding a port blocks the next run.

## Scripts

- `scripts/pty_send.py BASE_URL SESSION_ID PAYLOAD_FILE`: posts escape-decoded payload to `/api/sessions/<id>/send`. Run it inside the isolated instance only.
