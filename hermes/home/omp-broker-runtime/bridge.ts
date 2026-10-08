import { AuthStorage, streamSimple, generateImage, type as schema, type Context, type AssistantMessage, type ApiKeyResolver, type SimpleStreamOptions, type TextContent, type ImageContent, type ImageInput } from "@oh-my-pi/pi-ai";
import { AuthBrokerClient } from "@oh-my-pi/pi-ai/auth-broker/client";
import { RemoteAuthCredentialStore } from "@oh-my-pi/pi-ai/auth-broker/remote-store";
import { getBundledModels, type Model, type Api, type GeneratedProvider } from "@oh-my-pi/pi-catalog";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { PROVIDER_DESCRIPTORS, googleAntigravityModelManagerOptions, openaiCodexModelManagerOptions } from "@oh-my-pi/pi-catalog/provider-models";
import { readFile } from "node:fs/promises";

const PROVIDERS: Record<string, true> = { anthropic: true, "openai-codex": true, "google-antigravity": true, devin: true, commandcode: true };
interface WireCall { id: string; function: { name: string; arguments?: string } }
interface WireContent { type: string; text?: string; image_url?: string | { url: string }; source?: { type: string; media_type: string; data: string } }
interface WireMessage { role: string; content?: string | WireContent[] | null; timestamp?: number | string; tool_calls?: WireCall[]; tool_call_id?: string; tool_name?: string; name?: string; is_error?: boolean; reasoning_details?: { type: string; message?: AssistantMessage }[] }
interface WireTool { type: string; function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean } }
interface WireRequest {
  model?: string; messages?: WireMessage[]; tools?: WireTool[]; stream?: boolean; session_id?: string;
  reasoning_effort?: string; extra_body?: { reasoning?: { effort?: string; enabled?: boolean } };
  tool_choice?: string | { function?: { name?: string } }; max_completion_tokens?: number; max_tokens?: number;
  temperature?: number; top_p?: number; frequency_penalty?: number; presence_penalty?: number;
  stop?: string | string[]; service_tier?: string; prompt_cache_key?: string; reference_images?: string[];
  prompt?: string; aspect_ratio?: string; image_size?: string; count?: number;
}
interface BridgeInput { provider: string; action: string; broker: { url: string; token_file: string }; request: WireRequest }
const contentSchema = schema({ type: "string", "text?": "string", "image_url?": schema("string").or({ url: "string" }), "source?": { type: "string", media_type: "string", data: "string" } });
const callSchema = schema({ id: "string", function: { name: "string", "arguments?": "string" } });
const messageSchema = schema({ role: "string", "content?": schema("string | null").or(contentSchema.array()), "timestamp?": "number | string", "tool_calls?": callSchema.array(), "tool_call_id?": "string", "tool_name?": "string", "name?": "string", "is_error?": "boolean", "reasoning_details?": "object[]" });
const toolSchema = schema({ type: "string", function: { name: "string", "description?": "string", "parameters?": "object", "strict?": "boolean" } });
const inputSchema = schema({ provider: "string", action: "'chat' | 'image' | 'catalog' | 'status'", broker: { url: "string", token_file: "string" }, request: {
  "model?": "string", "messages?": messageSchema.array(), "tools?": toolSchema.array(), "stream?": "boolean", "session_id?": "string | null",
  "reasoning_effort?": "string", "extra_body?": { "reasoning?": { "effort?": "string", "enabled?": "boolean" } },
  "tool_choice?": "string | object", "max_completion_tokens?": "number", "max_tokens?": "number", "temperature?": "number", "top_p?": "number",
  "frequency_penalty?": "number", "presence_penalty?": "number", "stop?": "string | string[]", "service_tier?": "string", "prompt_cache_key?": "string",
  "reference_images?": "string[]", "prompt?": "string", "aspect_ratio?": "string", "image_size?": "string", "count?": "number"
} });
const controller = new AbortController();
process.on("SIGTERM", () => controller.abort());
process.on("SIGINT", () => controller.abort());
const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");

function imagePart(url: string, forGeneration: true): ImageInput;
function imagePart(url: string, forGeneration?: false): ImageContent;
function imagePart(url: string, forGeneration = false): ImageInput | ImageContent {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (data) return forGeneration ? { mimeType: data[1], data: data[2] } : { type: "image", mimeType: data[1], data: data[2] };
  // Python resolves references through Hermes's shared DNS, redirect and media-size boundary.
  throw new Error("Image input must be a resolved data URL");
}

export function imageInputsFor(references: string[]): ImageInput[] {
  // Gemini forwards these as Blob protobufs; the chat-only "type" discriminator is an invalid Blob field.
  return references.map(url => imagePart(url, true));
}

async function contentParts(content: WireMessage["content"]): Promise<(TextContent | ImageContent)[]> {
  if (typeof content === "string") return [{ type: "text", text: content }];
  const parts: (TextContent | ImageContent)[] = [];
  for (const part of content || []) {
    if (part.type === "text" || part.type === "input_text" || part.type === "output_text") parts.push({ type: "text", text: part.text || "" });
    else if (part.type === "image_url" && part.image_url) parts.push(imagePart(typeof part.image_url === "string" ? part.image_url : part.image_url.url));
    else if (part.type === "image" && part.source?.type === "base64") parts.push({ type: "image", mimeType: part.source.media_type, data: part.source.data });
    else throw new Error(`Unsupported content block: ${part.type}`);
  }
  return parts;
}

export async function contextFor(request: WireRequest, model: Model<Api>): Promise<Context> {
  const messages: Context["messages"] = [];
  const systemPrompt: string[] = [];
  const toolNames = new Map<string, string>();
  for (const row of request.messages || []) {
    for (const call of row.tool_calls || []) toolNames.set(call.id, call.function.name);
    const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) || 0 : row.timestamp || 0;
    if (row.role === "system" || row.role === "developer") {
      systemPrompt.push((await contentParts(row.content)).filter(p => p.type === "text").map(p => p.text).join("\n"));
    } else if (row.role === "user") {
      messages.push({ role: "user", content: await contentParts(row.content), timestamp });
    } else if (row.role === "tool") {
      if (!row.tool_call_id) throw new Error("Tool result has no tool_call_id");
      messages.push({ role: "toolResult", toolCallId: row.tool_call_id, toolName: row.name || row.tool_name || toolNames.get(row.tool_call_id) || "tool", content: await contentParts(row.content), isError: row.is_error === true, timestamp });
    } else if (row.role === "assistant") {
      const native = row.reasoning_details?.find(detail => detail.type === `${model.provider}.native_assistant`)?.message;
      if (native?.provider === model.provider && native.model === model.id) {
        messages.push({ ...native, timestamp });
        continue;
      }
      const content: AssistantMessage["content"] = await contentParts(row.content);
      for (const call of row.tool_calls || []) {
        content.push({ type: "toolCall", id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") });
      }
      messages.push({ role: "assistant", content, api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: row.tool_calls?.length ? "toolUse" : "stop", timestamp });
    } else throw new Error(`Unsupported message role: ${row.role}`);
  }
  const tools = (request.tools || []).map(tool => {
    if (tool.type !== "function") throw new Error("Only function tools are supported by the broker facade");
    return { name: tool.function.name, description: tool.function.description || "", parameters: tool.function.parameters || { type: "object", properties: {} }, strict: tool.function.strict };
  });
  return { systemPrompt, messages, ...(tools.length ? { tools } : {}) };
}

async function catalog(provider: string, auth: AuthStorage) {
  const bundled = getBundledModels(provider as GeneratedProvider);
  const resolved = await auth.keys.getWithCredential(provider, undefined);
  if (!resolved?.credentialId) throw new Error(`No active broker credential for ${provider}`);
  let options;
  if (provider === "google-antigravity") {
    options = googleAntigravityModelManagerOptions({ oauthToken: JSON.parse(resolved.apiKey).token });
  } else if (provider === "openai-codex") {
    options = openaiCodexModelManagerOptions({ resolveAccounts: async () => {
      const accounts = await auth.oauth.accessAll(provider, { signal: controller.signal });
      if (accounts.some(row => !row.ok)) return null;
      return accounts.flatMap(row => row.ok ? [{ accessToken: row.accessToken, accountId: row.accountId }] : []);
    } });
  } else {
    options = PROVIDER_DESCRIPTORS.find(row => row.providerId === provider)?.createModelManagerOptions({ apiKey: resolved.apiKey });
  }
  const dynamic = await options?.fetchDynamicModels?.();
  if (!dynamic) return bundled;
  const models = dynamic.map(row => buildModel(row));
  if (options?.dynamicModelsAuthoritative) return models;
  return [...new Map([...bundled, ...models].map(model => [model.id, model])).values()];
}

function usageFor(message: AssistantMessage) {
  const u = message.usage;
  return { prompt_tokens: u.input + u.cacheRead + u.cacheWrite, completion_tokens: u.output, total_tokens: u.totalTokens, prompt_tokens_details: { cached_tokens: u.cacheRead, cache_write_tokens: u.cacheWrite }, cost: u.cost.total };
}
function replayDetail(message: AssistantMessage) {
  // Only the provider transcript is persisted by Hermes; routing credentials and recovery payloads stay in Bun.
  const { credentialId, contextSnapshot, retryRecovery, errorMessage, ...native } = message;
  return { type: `${message.provider}.native_assistant`, message: native };
}
function completion(message: AssistantMessage) {
  return { id: message.responseId || "omp-native", object: "chat.completion", model: message.model, choices: [{ index: 0, finish_reason: message.stopReason === "toolUse" ? "tool_calls" : message.stopReason, message: {
    role: "assistant", content: message.content.filter(p => p.type === "text").map(p => p.text).join("") || null,
    reasoning_content: message.content.filter(p => p.type === "thinking").map(p => p.thinking).join("") || null,
    reasoning_details: [replayDetail(message)],
    tool_calls: message.content.filter(p => p.type === "toolCall").map(p => ({ id: p.id, type: "function", function: { name: p.name, arguments: JSON.stringify(p.arguments) } })),
  } }], usage: usageFor(message) };
}
export function streamOptions(request: WireRequest, resolver: ApiKeyResolver): SimpleStreamOptions {
  const reasoning = request.reasoning_effort ?? request.extra_body?.reasoning?.effort;
  const disabled = reasoning === "none" || request.extra_body?.reasoning?.enabled === false;
  const toolChoice = typeof request.tool_choice === "object" ? { type: "tool" as const, name: request.tool_choice.function?.name || "" } : request.tool_choice === "required" ? "any" : request.tool_choice;
  return { apiKey: resolver, signal: controller.signal, sessionId: request.session_id || undefined,
    maxTokens: request.max_completion_tokens ?? request.max_tokens, temperature: request.temperature,
    topP: request.top_p, frequencyPenalty: request.frequency_penalty, presencePenalty: request.presence_penalty,
    stopSequences: typeof request.stop === "string" ? [request.stop] : request.stop,
    reasoning: disabled ? undefined : reasoning === "ultra" || reasoning === "max" ? "xhigh" : reasoning,
    disableReasoning: disabled, toolChoice, serviceTier: request.service_tier,
    promptCacheKey: request.prompt_cache_key, codexSseMaxAttempts: 1 } as SimpleStreamOptions;
}

async function run(input: BridgeInput) {
  if (!Object.hasOwn(PROVIDERS, input.provider)) throw new Error("Unsupported broker provider");
  const token = (await readFile(input.broker.token_file, "utf8")).trim();
  if (!token) throw new Error("Broker token file is empty");
  const client = new AuthBrokerClient({ url: input.broker.url, token, maxRetries: 0 });
  const store = new RemoteAuthCredentialStore({ client, streamSnapshots: true });
  const auth = new AuthStorage(store, { sourceLabel: "omp-auth-broker", configValueResolver: async value => value });
  try {
    await store.refreshSnapshot();
    await auth.credentials.reload();
    if (input.action === "status") {
      emit({ result: { logged_in: auth.credentials.entries(input.provider).length > 0, auth_type: "omp_broker", source: "omp-auth-broker", api_base_url: `broker://${input.provider}` } });
      return;
    }
    if (input.action === "catalog") {
      const models = await catalog(input.provider, auth);
      emit({ result: models.map(m => {
        const metadata = m as Model & { release_date?: string; releaseDate?: string };
        return { id: m.id, name: m.name, context_window: m.contextWindow, max_output: m.maxTokens, input: m.input, reasoning: m.reasoning, kind: m.kind || "chat", api: m.api, identity: m.identity,
          ...(metadata.release_date || metadata.releaseDate ? { release_date: metadata.release_date || metadata.releaseDate, release_date_source: "omp-native-catalog" } : {}) };
      }) });
      return;
    }
    const request = input.request;
    const id = request.model?.replace(new RegExp(`^${input.provider}/`), "");
    let model = getBundledModels(input.provider as GeneratedProvider).find(row => row.id === id);
    if (!model) model = (await catalog(input.provider, auth)).find(row => row.id === id);
    if (!model) throw new Error(`Unknown native model ${input.provider}/${id}`);
    const nativeResolver = auth.keys.resolver(input.provider, { modelId: model.id, sessionId: request.session_id || undefined, baseUrl: model.baseUrl });
    const resolver: ApiKeyResolver = async context => {
      // Every actual attempt observes the broker, including disabled/deleted rows; no snapshot disk cache or local refresh.
      await store.refreshSnapshot();
      await auth.credentials.reload();
      if (!auth.credentials.entries(input.provider).length) throw new Error(`No active broker credential for ${input.provider}`);
      const resolved = await nativeResolver(context);
      if (!resolved || typeof resolved === "string" || !resolved.credentialId) throw new Error(`No usable broker credential for ${input.provider}`);
      return resolved;
    };
    if (input.action === "image") {
      const inputImages = imageInputsFor(request.reference_images || []);
      if (!request.prompt) throw new Error("Image prompt is required");
      emit({ result: await generateImage(model, { prompt: request.prompt, inputImages, aspectRatio: request.aspect_ratio, imageSize: request.image_size, count: request.count || 1 }, { apiKey: resolver, signal: controller.signal }) });
      return;
    }
    const context = await contextFor(request, model);
    const stream = streamSimple(model, context, streamOptions(request, resolver));
    const toolIndexes = new Map<number, number>();
    const toolArgs = new Set<number>();
    for await (const event of stream) {
      if (event.type === "error") throw Object.assign(new Error(event.error.errorMessage || "Native provider inference failed"), { status: event.error.errorStatus });
      if (event.type === "done") {
        if (!request.stream) emit({ result: completion(event.message) });
        else emit({ chunk: { model: model.id, choices: [{ index: 0, delta: { reasoning_details: [replayDetail(event.message)] }, finish_reason: event.reason === "toolUse" ? "tool_calls" : event.reason }], usage: usageFor(event.message) } });
        continue;
      }
      if (!request.stream) continue;
      let delta: Record<string, unknown> | undefined;
      if (event.type === "start") delta = { role: "assistant" };
      else if (event.type === "text_delta") delta = { content: event.delta };
      else if (event.type === "thinking_delta") delta = { reasoning_content: event.delta };
      else if (event.type === "toolcall_start") {
        const call = event.partial.content[event.contentIndex];
        if (call.type !== "toolCall") throw new Error("Native tool event contains no tool call");
        const index = toolIndexes.size;
        toolIndexes.set(event.contentIndex, index);
        delta = { tool_calls: [{ index, id: call.id, type: "function", function: { name: call.name, arguments: "" } }] };
      } else if (event.type === "toolcall_delta") {
        toolArgs.add(event.contentIndex);
        delta = { tool_calls: [{ index: toolIndexes.get(event.contentIndex), function: { arguments: event.delta } }] };
      } else if (event.type === "toolcall_end" && !toolArgs.has(event.contentIndex)) {
        delta = { tool_calls: [{ index: toolIndexes.get(event.contentIndex), function: { arguments: JSON.stringify(event.toolCall.arguments) } }] };
      }
      if (delta) emit({ chunk: { model: model.id, choices: [{ index: 0, delta, finish_reason: null }] } });
    }
  } finally {
    auth.close();
  }
}

export function safeError(error: unknown): { message: string; status: number } {
  // SDK errors can embed request headers; only a fixed category and numeric HTTP status may leave this host.
  const record: Record<string, unknown> = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (record.name === "OperationTimeoutError") return { message: "Native operation deadline exceeded", status: 504 };
  const message = typeof record.message === "string" ? record.message : "Native broker request failed";
  const rawStatus = record.status ?? record.errorStatus;
  const httpStatus = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
  const safePrefix = /^(Unsupported broker provider|Broker token file is empty|No active broker credential for [\w-]+|No usable broker credential for [\w-]+|Unknown native model [\w./-]+|Image prompt is required|Image input must be a resolved data URL|Tool result has no tool_call_id)$/;
  const category = safePrefix.test(message) ? message
    : /quota|rate.?limit|credit|balance|usage.?limit/i.test(message) || httpStatus === 402 || httpStatus === 429 ? "Upstream quota or rate limit exhausted"
    : /broker|ECONNREFUSED|Failed to fetch|Unable to connect/i.test(message) ? "omp auth-broker is unavailable"
    : httpStatus === 400 || httpStatus === 422 ? "Native upstream rejected the request"
    : httpStatus === 401 ? "Native upstream authentication failed"
    : httpStatus === 403 ? "Native upstream denied this request"
    : httpStatus === 404 ? "Native model or upstream route was not found"
    : record.name === "ValidationError" || record.name === "TraversalError" ? "Native SDK request validation failed"
    : "Native upstream inference failed";
  return { message: category + (httpStatus ? ` (HTTP ${httpStatus})` : ""), status: httpStatus ?? 500 };
}

export function startHostLifecycle(parentPid: number, timeoutMs: number): () => void {
  let forcedExit: NodeJS.Timeout | undefined;
  const stop = (reason: Error, code: number) => {
    controller.abort(reason);
    forcedExit ??= setTimeout(() => process.exit(code), 2_000);
    forcedExit.unref();
  };
  const parentWatch = parentPid > 0 ? setInterval(() => {
    if (process.ppid !== parentPid) stop(new Error("Native request owner exited"), 1);
  }, 250) : undefined;
  parentWatch?.unref();
  const deadline = timeoutMs > 0 ? setTimeout(() => {
    stop(Object.assign(new Error("Native operation deadline exceeded"), { name: "OperationTimeoutError" }), 124);
  }, timeoutMs) : undefined;
  return () => {
    clearInterval(parentWatch);
    clearTimeout(deadline);
    clearTimeout(forcedExit);
  };
}

if (import.meta.main) {
  const cleanup = startHostLifecycle(Number(process.argv[2] || 0), Number(process.argv[3] || 0));
  try {
    const parsed: unknown = JSON.parse(await Bun.stdin.text());
    // The request schema checks every consumed public field; native replay carriers are SDK-produced opaque history.
    const input = inputSchema.assert(parsed) as BridgeInput;
    await run(input);
  } catch (error: unknown) {
    emit({ error: safeError(controller.signal.aborted ? controller.signal.reason : error) });
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}
