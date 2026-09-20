import { NextRequest, NextResponse } from "next/server";
import { processCheck } from "@/services/check-engine";
import { analyzeContent } from "@/services/ai-check-service"; // <--- FIXED IMPORT

// NATIVE COST CONTROLS
const MAX_TEXT_LENGTH = 5000; // Prevents massive token consumption

export async function POST(req: NextRequest) {
  try {
    // 1. Parse Request
    const body = await req.json();
    const { textContent } = body;

    if (!textContent || typeof textContent !== "string") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // 2. Enforce Text Length Limit
    if (textContent.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ 
        error: `Text is too long. Please limit your input to ${MAX_TEXT_LENGTH} characters.` 
      }, { status: 400 });
    }

    // 3. Run cheap, instant deterministic checks first
    const response = await processCheck({ toolType: "AI", textContent });

    // 4. Run AI checks (Respecting the Kill Switch)
    const isAiEnabled = process.env.AI_ENABLED !== "false";
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

    if (isAiEnabled && hasApiKey && textContent.trim().length > 0) {
      try {
        // <--- FIXED FUNCTION CALL
        const aiResult = await analyzeContent(textContent);
        
        // Safely merge AI findings
        if (aiResult.additionalFindings && aiResult.additionalFindings.length > 0) {
          response.findings.push(...aiResult.additionalFindings);
        }
        if (aiResult.saferVersion) {
          response.saferVersion = aiResult.saferVersion;
        }

        // Recalculate risk
        if (aiResult.additionalFindings?.some((f: any) => f.severity === "HIGH")) {
          response.riskLevel = "HIGH";
        } else if (response.riskLevel !== "HIGH" && aiResult.additionalFindings?.some((f: any) => f.severity === "MEDIUM")) {
          response.riskLevel = "MEDIUM";
        }

        response.summary = `We found ${response.findings.length} thing${response.findings.length === 1 ? "" : "s"} to check.`;
        
        if (response.riskLevel === "HIGH") {
          response.dont = "DO NOT send this prompt to the AI in its current form.";
          response.check = "The specific high-risk items flagged in the findings.";
          response.do = "Use the 'Safer Version' provided below, or remove the flagged details manually.";
          response.why = "Sharing private context, credentials, or confidential company info with public AI can lead to data leaks.";
          response.next = "Copy the safer version and use that instead.";
        }

      } catch (aiError: any) {
        console.error("AI analysis failed:", aiError);
      }
    } else if (!isAiEnabled) {
      // Inform user if AI is disabled via Kill Switch
      response.limitations = "Advanced AI analysis is currently disabled by the administrator. Showing standard checks only.";
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}