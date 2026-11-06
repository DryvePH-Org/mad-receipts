const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function wholeToWords(n: number): string {
  if (n === 0) return "zero";
  const groups: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  const parts: string[] = [];
  for (const [size, name] of groups) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(" ");
}

// "1250.50" -> "One thousand two hundred fifty pesos and 50/100 only"
export function amountInWords(value: string | number): string {
  const centavosTotal = Math.round(Number(value) * 100);
  if (!Number.isFinite(centavosTotal) || centavosTotal < 0) return "";
  const pesos = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;
  const words = wholeToWords(pesos);
  const text = `${words} ${pesos === 1 ? "peso" : "pesos"}`;
  const full = centavos
    ? `${text} and ${String(centavos).padStart(2, "0")}/100`
    : text;
  return `${full[0].toUpperCase()}${full.slice(1)} only`;
}
