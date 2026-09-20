import { generateObject } from 'ai';
import { aiModel } from '@/lib/ai-provider';
import { z } from 'zod';

const photoAnalysisSchema = z.object({
  findings: z.array(z.object({
    category: z.string(), // e.g., "Document", "Screen", "QR Code", "License Plate"
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    description: z.string(), // e.g., "A computer monitor with readable text is visible in the background."
    recommendedAction: z.string(), // e.g., "Blur this area", "Crop this out", "Keep (looks safe)"
  })),
  summary: z.string(),
  dont: z.string(),
  check: z.string(),
  do: z.string(),
  why: z.string(),
  next: z.string(),
});

export async function analyzePhoto(imageBase64: string) {
  const { object } = await generateObject({
    model: aiModel,
    schema: photoAnalysisSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
          },
          {
            type: 'text',
            text: `You are FixMP Photo Check. Analyze this image for hidden privacy and safety leaks before the user shares it. 
            Look specifically for:
            - Documents, ID cards, or passports
            - Phone or computer screens with readable text/notifications
            - QR codes or barcodes
            - License plates or vehicle info
            - Reflections in windows, glasses, or screens
            - Other people's faces or private information
            - Location clues (street signs, house numbers)
            
            Do NOT analyze metadata. Only analyze what is visually present.
            If the image is completely safe (e.g., a picture of a landscape or a pet), return an empty findings array and a "LOW" risk summary.
            Return ONLY valid JSON matching the schema.`
          }
        ]
      }
    ],
  });

  return object;
}