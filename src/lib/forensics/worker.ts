/// <reference lib="webworker" />
import { runLocalForensics, type AnalyzeInput } from "./analyze";

export type WorkerRequest = {
  type: "analyze";
  fileName: string;
  fileType: string;
  fileBuffer: ArrayBuffer;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  scanLevel: "quick" | "standard";
  attemptExtraction: boolean;
};

export type WorkerResponse =
  | { type: "progress"; step: string; pct: number }
  | { type: "result"; result: Awaited<ReturnType<typeof runLocalForensics>> }
  | { type: "error"; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== "analyze") return;

  try {
    const input: AnalyzeInput = {
      fileName: msg.fileName,
      fileType: msg.fileType,
      fileBuffer: msg.fileBuffer,
      rgba: new Uint8ClampedArray(msg.rgbaBuffer),
      width: msg.width,
      height: msg.height,
      scanLevel: msg.scanLevel,
      attemptExtraction: msg.attemptExtraction,
    };
    const result = await runLocalForensics(input, (step, pct) => {
      ctx.postMessage({ type: "progress", step, pct } satisfies WorkerResponse);
    });
    ctx.postMessage({ type: "result", result } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Local analysis failed unexpectedly.",
    } satisfies WorkerResponse);
  }
};
