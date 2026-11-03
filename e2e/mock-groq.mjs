// A stand-in for the Groq API so the browser tests never call the real one.
// POST /openai/v1/chat/completions answers like the vision model; POST /__set changes what it says.
import { createServer } from "node:http";

const KEYS = ["receipt_no","receipt_date","buyer_name","buyer_address","buyer_contact","amount_words","amount","paper_payment_type","make_type","plate_no","motor_no","chassis_no","color","agreed_price","less_payment","balance","payment_method","check_no","bank_branch","balance_words","balance_amount","balance_due_date"];
const state = { down: false, receipt_no: "ZZT-E2E-0", plate_no: "NKF4771", amount: 100000 };

const fields = () => ({
  ...Object.fromEntries(KEYS.map((k) => [k, null])),
  receipt_no: state.receipt_no,
  receipt_date: "2026-11-03",
  buyer_name: "ZZT E2E Buyer",
  amount: state.amount,
  amount_words: "One Hundred Thousand Only",
  paper_payment_type: "earnest",
  make_type: "2021 Honda Civic",
  plate_no: state.plate_no,
  color: "Black",
  agreed_price: 500000,
  payment_method: "cash",
  balance_due_date: "2026-11-20",
});

const readBody = (req) => new Promise((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

createServer(async (req, res) => {
  const body = await readBody(req);
  res.setHeader("content-type", "application/json");
  if (req.url === "/__set") {
    Object.assign(state, JSON.parse(body || "{}"));
    return res.end("{}");
  }
  if (state.down) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: { message: "mock outage" } }));
  }
  res.end(JSON.stringify({ id: "mock", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(fields()) }, finish_reason: "stop" }] }));
}).listen(8766, "127.0.0.1");
