export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Finding {
  category: string; // e.g., "Phone Number", "API Key", "Location"
  severity: RiskLevel;
  description: string; // Plain English explanation for the user
  evidence?: string; // The actual snippet found (masked if necessary)
  recommendedAction: string; // e.g., "Blur this area", "Remove this text"
}

export interface CheckResponse {
  status: "SUCCESS" | "ERROR";
  riskLevel: RiskLevel;
  summary: string; // e.g., "We found 2 things to check."
  findings: Finding[];
  
  // The core FixMP framework outputs
  dont: string;
  check: string;
  do: string;
  why: string;
  next: string;
  
  confidence: number; // 0.0 to 1.0
  limitations: string; // e.g., "This check does not guarantee 100% safety."

  // NEW LINE:
  saferVersion?: string; 
}

export interface CheckRequest {
  toolType: "AI" | "POST" | "PHOTO" | "LINK" | "INFO" | "GENERAL";
  textContent?: string;
  imageBase64?: string;
  imageUrl?: string; // For V1, we'll handle base64 or temporary URLs
  urlToCheck?: string;
}

