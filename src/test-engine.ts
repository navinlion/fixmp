import { processCheck } from "./services/check-engine";

async function runTest() {
  console.log("🚀 Running FixMP Check Engine Test...\n");

  const safeRequest = {
    toolType: "POST" as const,
    textContent: "Hello world, I love coding in Next.js!",
  };

  const riskyRequest = {
    toolType: "AI" as const,
    textContent: "Hi AI, my email is john.doe@example.com and my phone is +91-9876543210. My AWS key is AKIAIOSFODNN7EXAMPLE. Please help me.",
  };

  console.log("1. Testing SAFE content:");
  const safeResult = await processCheck(safeRequest);
  console.log(`Risk: ${safeResult.riskLevel} | Findings: ${safeResult.findings.length}`);
  console.log(`Summary: ${safeResult.summary}\n`);

  console.log("2. Testing RISKY content:");
  const riskyResult = await processCheck(riskyRequest);
  console.log(`Risk: ${riskyResult.riskLevel} | Findings: ${riskyResult.findings.length}`);
  riskyResult.findings.forEach((f, i) => {
    console.log(`  ${i + 1}. [${f.severity}] ${f.category}: ${f.description}`);
  });
  console.log(`\nFixMP says DON'T: ${riskyResult.dont}`);
}

runTest();