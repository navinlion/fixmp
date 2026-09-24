import { generateObject } from 'ai';
import type { ImagePart, TextPart, UserModelMessage } from 'ai';
import { aiModel, aiModelFallback } from '@/lib/ai-provider';
import { z } from 'zod';
import type { CheckResponse, Finding, RiskLevel } from '@/types/check';

const AI_TIMEOUT_MS = 45_000; // spec §13 — a hung provider call must never hang the product

const photoAnalysisSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      description: z.string(),
      recommendedAction: z.string(),
      boundingBox: z
        .object({ yMin: z.number(), xMin: z.number(), yMax: z.number(), xMax: z.number() })
        .nullable(),
    })
  ),
  dont: z.string(),
  check: z.string(),
  do: z.string(),
  why: z.string(),
  next: z.string(),
});

function buildMessages(imageDataUrl: string, note?: string): UserModelMessage[] {
  const parts: (ImagePart | TextPart)[] = [
    { type: 'image', image: imageDataUrl },
    {
      type: 'text',
      text: `You are FixMP, a photo privacy checker. The user is about to share this photo publicly and asked: "Did I miss anything?"

Look ONLY for things actually visible in the image:
- documents, ID cards, letters, packages, labels
- phone screens, computer monitors, notifications
- visible phone numbers, email addresses, addresses, names
- QR codes, barcodes, license plates
- asset/tracking codes, order numbers
- reflections revealing screens or people
- location clues (street signs, storefronts, house numbers)
- other people, children, or private information in the background

Be conservative: never invent findings. If the photo is clean, return an empty findings array.

For each finding tied to a VISIBLE region of the image, provide boundingBox using normalized coordinates on a 0–1000 scale (yMin = top, xMin = left, yMax = bottom, xMax = right). Set boundingBox to null only when the finding has no specific visible location.

Write in plain, calm language for a non-technical user (say "your phone number is visible", never "PII detected"). Fill dont/check/do/why/next as short, concrete FixMP guidance.${note ? ` User note: "${note}"` : ""}`,
    },
  ];
  return [{ role: 'user', content: parts }];
}

function isOverloadError(e: unknown): boolean {
  return /overload|high demand|503|rate|timeout/i.test(String((e as any)?.message ?? ""));
}

export async function analyzeImage(imageDataUrl: string, note?: string): Promise<CheckResponse> {
  const messages = buildMessages(imageDataUrl, note);
  const params = {
    schema: photoAnalysisSchema,
    maxRetries: 0, // free-tier testing: each SDK retry burns quota; our own fallback handles resilience
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
  };

  let object: z.infer<typeof photoAnalysisSchema>;
  try {
    ({ object } = await generateObject({ model: aiModel, ...params, messages }));
  } catch (e) {
    if (aiModelFallback && isOverloadError(e)) {
      ({ object } = await generateObject({ model: aiModelFallback, ...params, messages }));
    } else {
      throw e;
    }
  }

  const maxSeverity = (findings: Finding[]): RiskLevel => {
    if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
    if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
    return "LOW";
  };

  const findings: Finding[] = object.findings.map((f) => ({
    category: f.category,
    severity: f.severity,
    description: f.description,
    recommendedAction: f.recommendedAction,
    region: f.boundingBox ?? undefined,
  }));

  return {
    status: "SUCCESS",
    riskLevel: maxSeverity(findings),
    summary:
      findings.length === 0
        ? "We looked carefully and found nothing in this photo that screams 'remove me' — but the final judgement is yours."
        : object.summary,
    findings,
    dont: object.dont,
    check: object.check,
    do: object.do,
    why: object.why,
    next: object.next,
    confidence: 0.72,
    limitations:
      "This is an automated visual analysis. It may not catch highly obscured details, tiny text, or things only you would recognise as sensitive.",
  };
}