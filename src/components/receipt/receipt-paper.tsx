import { Fragment } from "react";
import "./paper.css";
import { FitBox } from "./fit-box";
import { halfOf, type PaperKey } from "@/lib/paper";
import { balanceInfo, totalsFromForm, words } from "@/lib/deal/math";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/deal/settings";
import { KIND_LABELS, type FormState, type PaymentKind } from "@/lib/deal/types";
import { formatDate } from "@/lib/dates";
import { formatPeso, toCentavos } from "@/lib/rules/money";


const peso = (v: string) => toCentavos(v) ?? 0;
const NB = " ";

/** **bold** and "- " bullets, as typed in the remarks box. */
function Remarks({ text, bullet = "b" }: { text: string; bullet?: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <>
      {lines.map((line, i) => {
        const isBullet = /^\s*[-•]\s+/.test(line);
        const body = line.replace(/^\s*[-•]\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <b key={j}>{p.slice(2, -2)}</b> : <Fragment key={j}>{p}</Fragment>));
        return <p key={i} className={isBullet ? bullet : undefined}>{isBullet ? "• " : ""}{parts}</p>;
      })}
    </>
  );
}

function payRows(s: FormState) {
  const rows: { label: string; detail: string; amount: number }[] = [];
  if (peso(s.cash)) rows.push({ label: "Cash", detail: "", amount: peso(s.cash) });
  for (const m of s.methods) {
    if (!peso(m.amount)) continue;
    if (m.type === "check") rows.push({ label: "Check", detail: [m.checkNo && `No. ${m.checkNo}`, m.bank, m.branch && `Br. ${m.branch}`].filter(Boolean).join(" · "), amount: peso(m.amount) });
    else rows.push({ label: m.name || "Other", detail: m.ref, amount: peso(m.amount) });
  }
  return rows;
}

const dueTextOf = (s: FormState) => (s.dueMode === "date" ? (s.dueDate ? formatDate(s.dueDate) : "") : s.dueText.trim());

interface Props {
  state: FormState;
  company: AppSettings["company"];
  /** how the Admin set the printed receipt up (logo, wording, colours) */
  print?: AppSettings["print"];
  /** the sheet it is printed on; the receipt is half of it (default: what the Admin chose) */
  paper?: PaperKey;
  copy: string;
  unapproved?: boolean;
  /** hears how much the half page had to shrink the writing (1 = not at all) */
  onFit?: (scale: number) => void;
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export function ReceiptPaper({ state: s, company: co, print: pr = DEFAULT_SETTINGS.print, paper, copy, unapproved, onFit }: Props) {
  const t = totalsFromForm(s);
  const rows = payRows(s);
  const bi = balanceInfo(t);
  const notes = s.notes.filter((n) => n.on && n.text.trim());
  const n = s.units.length;
  const date = s.date ? formatDate(s.date) : "";
  const tradeText = [[s.ti.year, s.ti.unit].filter(Boolean).join(" "), s.ti.plate, s.ti.mileage && `${s.ti.mileage} km`].filter(Boolean);
  const v = (x: string) => x || NB;

  const kinds = (Object.keys(KIND_LABELS) as PaymentKind[]);
  const methods = rows.filter((r) => r.label !== "Cash");
  const cash = peso(s.cash) > 0;
  const check = methods.find((r) => r.label === "Check");
  const checkMethod = s.methods.find((m) => m.type === "check" && peso(m.amount) > 0);
  const others = methods.filter((r) => r.label !== "Check");
  // Everything that applies to this transaction beyond the booklet's own lines, as labelled cells (nothing is left out)
  const money = (c: number) => formatPeso(c);
  const details: [string, string][] = ([
    s.sale === "financing" && ["Sale", `Financing${s.institution ? ` · ${s.institution}` : ""}`],
    s.sale !== "financing" && (s.hasTi || s.hasLieu || t.earlier > 0 || t.payout > 0 || n > 1) && ["Sale", "Cash"],
    s.sale === "financing" && t.dpSet && ["Down payment", money(t.dp)],
    s.sale === "financing" && t.loan > 0 && [`Loan${s.institution ? ` from ${s.institution}` : ""}`, `${money(t.loan)} (paid by the lender)`],
    s.sale === "financing" && t.fee > 0 && ["Processing fee", `${money(t.fee)} (paid by the buyer)`],
    s.sale === "financing" && t.monthly > 0 && ["Monthly payment", `${money(t.monthly)}${s.years ? ` × ${Number(s.years) * 12} months (${s.years} ${s.years === "1" ? "year" : "years"})` : ""}`],
    s.hasTi && ["Trade-in unit", tradeText[0] || "—"],
    s.hasTi && tradeText[1] && ["Trade-in plate", tradeText[1]],
    s.hasTi && tradeText[2] && ["Trade-in mileage", tradeText[2]],
    s.hasTi && ["Trade-in value", `${money(t.tv)} (taken off the price)`],
    s.hasLieu && ["In lieu of documents", t.lieu > 0 ? money(t.lieu) : "amount not set"],
    s.hasLieu && ["Pay on or before", s.lieuUntil ? formatDate(s.lieuUntil) : "—"],
    t.earlier > 0 && ["Earlier payments", money(t.earlier)],
    t.earlier > 0 && ["Paid today", money(t.today)],
    t.payout > 0 && ["Paid out to the buyer", money(t.payout)],
    n > 1 && ["Units on this receipt", String(n)],
  ].filter(Boolean) as [string, string][]);
  const termLines = lines(pr.terms);
  return (
    <article className="paper ack" style={{ ["--no" as string]: pr.numberColor, ["--pw" as string]: `${halfOf(paper ?? pr.paper).w}mm`, ["--ph" as string]: `${halfOf(paper ?? pr.paper).h}mm` }}>
      {unapproved && <div className="wm">UNAPPROVED</div>}
      <FitBox onFit={onFit}>
        <header className="ah">
          {pr.showLogo && pr.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pr.logo} alt="" className="alogo" />
          )}
          <div className="aname"><h1>{co.name}</h1>{lines(co.address).map((l, i) => <p key={i}>{l}</p>)}</div>
        </header>
        <div className="atitle"><h2>{co.tagline}</h2><div className="ano"><span>No.</span><b>{s.receiptNo || "____"}</b></div></div>
        <div className="adate">Date: <span className="ul">{v(date)}</span></div>
        <div className="arow"><label>Received from</label><span className="ul grow">{v(s.receivedFrom)}</span></div>
        <div className="arow"><label>Postal Address</label><span className="ul grow">{v(s.address)}</span></div>
        <div className="arow"><label>Contact No.</label><span className="ul grow mono">{v(s.contact)}</span></div>
        <div className="arow"><label>The sum of PESOS:</label><span className="ul grow">{t.today ? words(t.today) : NB}</span></div>
        <div className="arow wrapRow">
          <span>(₱ <span className="ul mono amt">{t.today ? formatPeso(t.today).replace("₱", "") : NB}</span>) as (</span>
          {kinds.map((k, i) => <Fragment key={k}>{i > 0 && <span> / </span>}<span className={s.kind === k ? "pick" : undefined}>{KIND_LABELS[k].toLowerCase()}</span></Fragment>)}
          <span>) for the purchase of <b>{n === 1 ? "one(1)" : `${n}`}</b> unit vehicle{n === 1 ? "" : "s"} described as follows:</span>
        </div>
        <div className="acols">
          <div className="aveh">
            {s.units.map((u, i) => (
              <Fragment key={i}>
                {n > 1 && <div className="aunit">Unit {i + 1} of {n}</div>}
                <div className="arow"><label>Make / Type</label><span className="ul grow">{v(u.makeType)}</span></div>
                <div className="arow"><label>Plate No.</label><span className="ul grow mono">{v(u.plate)}</span></div>
                <div className="arow"><label>Color</label><span className="ul grow">{v(u.color)}</span></div>
              </Fragment>
            ))}
          </div>
          <div className="amoney">
            <div className="arow"><label>Agreed Price</label><span className="ul grow mono">{t.price ? formatPeso(t.price) : NB}</span></div>
            {t.tv > 0 && <div className="arow"><label>Less Trade-in</label><span className="ul grow mono">{formatPeso(t.tv)}</span></div>}
            {t.loan > 0 && <div className="arow"><label>Less Loan</label><span className="ul grow mono">{formatPeso(t.loan)}</span></div>}
            {(t.tv > 0 || t.loan > 0) && <div className="arow"><label>{t.due < 0 ? "We pay Buyer" : "Amount Due"}</label><span className="ul grow mono">{formatPeso(Math.abs(t.due))}</span></div>}
            <div className="arow"><label>Less Payment</label><span className="ul grow mono">{t.paid ? formatPeso(t.paid) : NB}</span></div>
            <div className="arow"><label>{bi.label === "Balance" || bi.label.startsWith("Balance") ? "Balance" : bi.label}</label><span className="ul grow mono"><b>{t.price ? formatPeso(bi.amount) : NB}</b></span></div>
            <div className="apay">
              <span className="bx2"><i>{cash ? "✕" : ""}</i> Cash</span>
              <span className="bx2"><i>{check ? "✕" : ""}</i> Check</span><span className="ul grow mono small">{checkMethod ? [checkMethod.checkNo && `No. ${checkMethod.checkNo}`, formatPeso(peso(checkMethod.amount))].filter(Boolean).join(" · ") : NB}</span>
            </div>
            <div className="arow"><label>Bank / Br.</label><span className="ul grow">{checkMethod ? [checkMethod.bank, checkMethod.branch && `Br. ${checkMethod.branch}`].filter(Boolean).join(" / ") || NB : NB}</span></div>
            {others.length > 0 && <div className="aother">{others.map((r, i) => <span key={i}><i>✕</i> {r.label}{r.detail && ` ${r.detail}`} {formatPeso(r.amount)}</span>)}</div>}
          </div>
        </div>
        <div className="arow wrapRow bal">
          <span>Balance of</span><span className="ul grow">{t.balance > 0 ? words(t.balance) : t.price ? (t.balance === 0 ? (t.due < 0 ? "Nil, settled" : "Nil, paid in full") : "—") : NB}</span>
          <span>(₱ <span className="ul mono amt">{t.price ? formatPeso(Math.max(0, t.balance)).replace("₱", "") : NB}</span>)</span>
        </div>
        <div className="arow"><span>shall be given on or before</span><span className="ul grow">{t.balance > 0 ? v(dueTextOf(s)) : NB}</span></div>
        {details.length > 0 && <dl className="adetails">{details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {(termLines.length > 0 || (s.hasRem && s.remarks.trim()) || notes.length > 0) && (
          <div className="aterms">
            {termLines.length > 0 && <p><b>Remarks:</b> {termLines.join(" ")}</p>}
            {s.hasRem && s.remarks.trim() && <Remarks text={s.remarks} />}
            {notes.map((x, i) => <p key={i}>• {x.text}</p>)}
          </div>
        )}
        <div className="asign"><div><span /><small>({pr.buyerLabel})</small></div><div><span /><small>{pr.receiverLabel}</small></div></div>
        <footer className="afoot">{pr.footerNote && <p><b>Note:</b> {pr.footerNote}</p>}<small>{copy}</small></footer>
      </FitBox>
    </article>
  );

}
