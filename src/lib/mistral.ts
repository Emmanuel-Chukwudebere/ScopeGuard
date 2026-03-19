import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});

const SOW_SYSTEM_PROMPT = `You are a professional project analyst. Analyze the client notes provided and extract a structured Statement of Work (SOW).

Return ONLY valid JSON matching this exact schema:
{
  "summary": "One sentence project summary",
  "inScope": ["Deliverable 1", "Deliverable 2"],
  "outOfScope": ["Item 1", "Item 2"],
  "totalPrice": <number from user input>
}

Rules:
- inScope: concrete deliverables the client explicitly asked for
- outOfScope: related work not mentioned or explicitly excluded
- summary: one clear sentence describing the project
- totalPrice: use the exact price provided
- Return ONLY the JSON object, no markdown, no explanation`;

const GATEKEEPER_SYSTEM_PROMPT = `You are a scope gatekeeper for a freelance project. Compare the client's request against the locked Statement of Work (SOW).

Return ONLY valid JSON matching this exact schema:
{
  "verdict": "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE",
  "reasoning": "Brief explanation of your decision",
  "estimatedSurcharge": <number or null>
}

Verdict criteria:
- IN_SCOPE: Request is clearly covered by items listed in inScope
- GRAY_AREA: Request is related to scope items but not explicitly listed — needs freelancer decision
- OUT_OF_SCOPE: Request matches outOfScope items or is entirely new work not covered

For OUT_OF_SCOPE, estimate a reasonable surcharge based on complexity relative to the total project price.
For GRAY_AREA, set estimatedSurcharge to null.
For IN_SCOPE, set estimatedSurcharge to null.

Return ONLY the JSON object, no markdown, no explanation`;

export async function generateSow(clientNotes: string, basePrice: number) {
  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: SOW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Client notes:\n${clientNotes}\n\nBase price: $${basePrice}`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Failed to generate SOW from Mistral");
  }
  return JSON.parse(content);
}

export async function checkScope(
  requestText: string,
  sowData: {
    summary: string;
    inScope: string[];
    outOfScope: string[];
    totalPrice: number;
  }
) {
  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: GATEKEEPER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `SOW:\n${JSON.stringify(sowData, null, 2)}\n\nClient request: "${requestText}"`,
      },
    ],
    responseFormat: { type: "json_object" },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Failed to check scope from Mistral");
  }
  return JSON.parse(content);
}
