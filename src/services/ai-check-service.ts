import { generateObject } from 'ai';
import { aiModel } from '@/lib/ai-provider';
import { z } from 'zod';

const aiAnalysisSchema = z.object({
  additionalFindings: z.array(z.object({
    category: z.string(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    description: z.string(),
    recommendedAction: z.string(),
  })),
  saferVersion: z.string().optional(), // Optional, as images don't always have a "safer text version"
});

export async function analyzeContent(text: string, imageBase64?: string) {
  // Build the prompt parts array for multimodal support
  const parts: any[] = [];
  
  if (imageBase64) {
    parts.push({
      type: 'image',
      image: imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
    });
  }
  
  parts.push({
    type: 'text',
    text: `You are FixMP, a privacy and safety checker. Analyze this content intended for a social media post or public share.
1. Look for sensitive info in the text (names, emails, phones, keys, passwords, locations).
2. If an image is provided, scan the background for: documents, ID cards, phone screens, computer monitors, QR codes, barcodes, license plates, or visible notifications.
3. Create a 'saferVersion' of the text (if applicable) where sensitive parts are replaced with [REDACTED].
4. Return ONLY valid JSON matching the schema.

Text to analyze: "${text || 'No text provided, analyze the image only.'}"`,
  });

  const { object } = await generateObject({
    model: aiModel,
    schema: aiAnalysisSchema,
    messages: [{ role: 'user', content: parts }],
  });

  return object;
}