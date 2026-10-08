import { expect, test } from "bun:test";
import { getBundledModel } from "@oh-my-pi/pi-catalog";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { contextFor, streamOptions, imageInputsFor, safeError } from "./bridge";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("native signed tool history and vision bytes survive tool continuation", async () => {
  const model = getBundledModel("google-antigravity", "gemini-3.8-flash");
  const native: AssistantMessage = {
    role: "assistant", api: model.api, provider: model.provider, model: model.id,
    content: [{ type: "thinking", thinking: "Inspect the picture", thinkingSignature: "opaque-signature" },
              { type: "toolCall", id: "call-1", name: "inspect", arguments: { path: "picture.png" } }],
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
             cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse", timestamp: 0,
  };
  const context = await contextFor({
    messages: [
      { role: "system", content: "Keep this prefix unchanged.\n" },
      { role: "user", content: [{ type: "text", text: "Inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "call-1", function: { name: "inspect", arguments: '{"path":"picture.png"}' } }],
        reasoning_details: [{ type: "google-antigravity.native_assistant", message: native }] },
      { role: "tool", tool_call_id: "call-1", content: [{ type: "text", text: "A red square" }, { type: "image_url", image_url: "data:image/png;base64,AQID" }] },
    ],
    tools: [{ type: "function", function: { name: "inspect", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } }],
  }, model);
  expect(context.systemPrompt).toEqual(["Keep this prefix unchanged.\n"]);
  expect(context.messages[0]).toMatchObject({ role: "user", content: [{ type: "text", text: "Inspect" }, { type: "image", mimeType: "image/png", data: "AQID" }] });
  expect(context.messages[1]).toEqual(native);
  expect(context.messages[2]).toMatchObject({ role: "toolResult", toolCallId: "call-1", toolName: "inspect", isError: false,
    content: [{ type: "text", text: "A red square" }, { type: "image", mimeType: "image/png", data: "AQID" }] });
  expect(context.tools?.[0].parameters).toEqual({ type: "object", properties: { path: { type: "string" } }, required: ["path"] });
});

test("caller reasoning and output budgets do not get upgraded by the facade", () => {
  const resolver = () => undefined;
  expect(streamOptions({ reasoning_effort: "low", max_tokens: 128 }, resolver)).toMatchObject({ reasoning: "low", maxTokens: 128, disableReasoning: false });
  expect(streamOptions({ extra_body: { reasoning: { enabled: false, effort: "high" } }, max_completion_tokens: 64 }, resolver)).toMatchObject({ reasoning: undefined, maxTokens: 64, disableReasoning: true });
  expect(streamOptions({ tool_choice: "required" }, resolver).toolChoice).toBe("any");
});

test("native host refuses unresolved vision URLs", async () => {
  const model = getBundledModel("google-antigravity", "gemini-3.8-flash");
  await expect(contextFor({
    messages: [{ role: "user", content: [{ type: "image_url", image_url: "http://127.0.0.1/private.png" }] }],
  }, model)).rejects.toThrow("Image input must be a resolved data URL");
});

test("generation references contain only Gemini Blob fields, not chat discriminators", () => {
  expect(imageInputsFor(["data:image/png;base64,AQID"])).toEqual([{ mimeType: "image/png", data: "AQID" }]);
});

test("native HTTP diagnostics retain status without disclosing provider error contents", () => {
  const diagnostic = safeError({
    name: "ImageApiError", status: 400,
    message: 'Invalid JSON payload: Unknown name "type"; Authorization: Bearer secret-test-value',
    headers: { Authorization: "Bearer secret-test-value" },
  });
  expect(diagnostic).toEqual({ message: "Native upstream rejected the request (HTTP 400)", status: 400 });
  expect(safeError({ status: 429, message: "private provider payload" })).toEqual({
    message: "Upstream quota or rate limit exhausted (HTTP 429)", status: 429,
  });
});

// These integration tests exercise timers in separate OS processes; the test runner's fake clock cannot drive them.
test("native operation deadline terminates an unresponsive request host", async () => {
  const moduleUrl = new URL("./bridge.ts", import.meta.url).href;
  const script = `import {startHostLifecycle} from ${JSON.stringify(moduleUrl)};
startHostLifecycle(process.ppid, 10); setInterval(() => {}, 1000);`;
  const host = Bun.spawn([process.execPath, "-e", script], { stdout: "ignore", stderr: "ignore" });
  try {
    expect(await host.exited).toBe(124);
  } finally {
    host.kill();
  }
}, 10_000);

test("native host exits when its original owner disappears", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-native-owner-"));
  const marker = join(directory, "exited");
  const childPidFile = join(directory, "child");
  const moduleUrl = new URL("./bridge.ts", import.meta.url).href;
  const childScript = `import {startHostLifecycle} from ${JSON.stringify(moduleUrl)};
import {writeFileSync} from "node:fs";
process.on("exit", code => writeFileSync(${JSON.stringify(marker)}, String(code)));
startHostLifecycle(Number(process.env.HERMES_NATIVE_TEST_OWNER_PID), 0); setInterval(() => {}, 1000);`;
  const ownerScript = `import {writeFileSync} from "node:fs";
const child=Bun.spawn([process.execPath,"-e",${JSON.stringify(childScript)}],
{stdin:"ignore",stdout:"ignore",stderr:"ignore",env:{...process.env,HERMES_NATIVE_TEST_OWNER_PID:String(process.pid)}});
writeFileSync(${JSON.stringify(childPidFile)},String(child.pid)); setInterval(() => {},1000);`;
  const owner = Bun.spawn([process.execPath, "-e", ownerScript], { stdout: "ignore", stderr: "ignore" });
  let childPid = 0;
  try {
    const readyDeadline = Date.now() + 5_000;
    while (!await Bun.file(childPidFile).exists() && Date.now() < readyDeadline) await Bun.sleep(50);
    childPid = Number(await readFile(childPidFile, "utf8"));
    owner.kill("SIGKILL");
    await owner.exited;
    const exitDeadline = Date.now() + 6_000;
    while (!await Bun.file(marker).exists() && Date.now() < exitDeadline) await Bun.sleep(50);
    expect(await readFile(marker, "utf8")).toBe("1");
  } finally {
    owner.kill();
    if (childPid) {
      try { process.kill(childPid, "SIGKILL"); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
