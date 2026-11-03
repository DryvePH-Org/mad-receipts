// Scores the photo-reading prompt against a receipt whose true values you know.
//   node --env-file=.env.local scripts/eval-extraction.mjs <photo.jpg> <truth.json> <prompt.txt> [runs]
// Uses your real Groq key (about 2 reads per minute on the free tier). Nothing is saved.
import { readFileSync } from "node:fs";

const [photo, truthFile, promptFile, runs = "1"] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(truthFile, "utf8"));
const prompt = readFileSync(promptFile, "utf8");
const image = `data:image/jpeg;base64,${readFileSync(photo).toString("base64")}`;

const norm = (v) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? v : String(v).toUpperCase().replace(/[^A-Z0-9]/g, ""));
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(/,/g, "")));
const same = (key, a, b) => (typeof truth[key] === "number" ? num(a) === truth[key] : norm(a) === norm(b));

for (let i = 0; i < Number(runs); i++) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_VISION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: [{ type: "text", text: "Extract the fields from this form." }, { type: "image_url", image_url: { url: image } }] },
      ],
    }),
  });
  if (!res.ok) { console.log("HTTP", res.status, (await res.text()).slice(0, 200)); await new Promise((r) => setTimeout(r, 30000)); i--; continue; }
  const out = JSON.parse((await res.json()).choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  let right = 0;
  const wrong = [];
  for (const key of Object.keys(truth)) {
    if (same(key, out[key], truth[key])) right++;
    else wrong.push(`${key}: got ${JSON.stringify(out[key])} want ${JSON.stringify(truth[key])}`);
  }
  console.log(`run ${i + 1}: ${right}/${Object.keys(truth).length} fields right`);
  wrong.forEach((w) => console.log("   ✗", w));
  if (i + 1 < Number(runs)) await new Promise((r) => setTimeout(r, 35000));
}
