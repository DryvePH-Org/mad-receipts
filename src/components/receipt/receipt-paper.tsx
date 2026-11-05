import { Fragment } from "react";
import "./paper.css";
import { balanceInfo, totalsFromForm, words } from "@/lib/deal/math";
import type { AppSettings } from "@/lib/deal/settings";
import { KIND_LABELS, type FormState, type PaymentKind } from "@/lib/deal/types";
import { formatDate } from "@/lib/dates";
import { formatPeso, toCentavos } from "@/lib/rules/money";

export type PaperLayout = "form" | "half" | "slip";
export const LAYOUTS: { id: PaperLayout; name: string; size: string; page: string }[] = [
  { id: "form", name: "Official form", size: "A4 · 210 × 297 mm", page: "210mm 297mm" },
  { id: "half", name: "Half page", size: "A5 · 148 × 210 mm", page: "148mm 210mm" },
  { id: "slip", name: "Receipt slip", size: "80 mm roll", page: "80mm 320mm" },
];

const peso = (v: string) => toCentavos(v) ?? 0;
const minus = (c: number) => `− ${formatPeso(c)}`;
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

function SlipRow({ k, val, bold }: { k: string; val?: string; bold?: boolean }) {
  return <div className={`r${bold ? " bold" : ""}`}><span>{k}</span><span>{val || NB}</span></div>;
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
const saleLine = (s: FormState, t: ReturnType<typeof totalsFromForm>) =>
  s.sale !== "financing" ? "Cash sale" : `Financing · ${[s.institution, t.dpSet && `DP ${formatPeso(t.dp)}`, t.monthly && `${formatPeso(t.monthly)}/month`, s.years && `${s.years} ${s.years === "1" ? "year" : "years"}`].filter(Boolean).join(" · ")}`;
const initials = (name: string) => (name.match(/\b\w/g) ?? ["M"]).slice(0, 3).join("").toUpperCase();

interface Props {
  state: FormState;
  company: AppSettings["company"];
  layout: PaperLayout;
  copy: string;
  unapproved?: boolean;
}

export function ReceiptPaper({ state: s, company: co, layout, copy, unapproved }: Props) {
  const t = totalsFromForm(s);
  const rows = payRows(s);
  const bi = balanceInfo(t);
  const notes = s.notes.filter((n) => n.on && n.text.trim());
  const n = s.units.length;
  const date = s.date ? formatDate(s.date) : "";
  const tradeText = [[s.ti.year, s.ti.unit].filter(Boolean).join(" "), s.ti.plate, s.ti.mileage && `${s.ti.mileage} km`].filter(Boolean);
  const v = (x: string) => x || NB;

  if (layout === "slip") {
    const U = (x: string) => x.toUpperCase();
    return (
      <article className="paper slip">
        {unapproved && <div className="c bold" style={{ border: "1px solid #000", padding: ".2rem", marginBottom: ".4rem" }}>*** UNAPPROVED COPY ***</div>}
        <div className="c"><div className="t">{U(co.name)}</div><div style={{ letterSpacing: ".18em" }}>{U(co.tagline)}</div></div><hr />
        <SlipRow k="NO." val={s.receiptNo} bold /><SlipRow k="DATE" val={U(date)} /><SlipRow k="TYPE" val={U(KIND_LABELS[s.kind])} /><hr />
        <div>RECEIVED FROM</div><div className="bold">{v(s.receivedFrom)}</div><div style={{ marginTop: ".25rem" }}>{s.address}</div><div>{s.contact}</div><hr />
        {s.units.map((u, i) => (
          <Fragment key={i}>
            <div>{n > 1 ? `UNIT ${i + 1} OF ${n}` : "1 UNIT"}</div><div className="bold">{v(u.makeType)}</div>
            <SlipRow k="PLATE" val={u.plate} /><SlipRow k="COLOR" val={u.color} /><SlipRow k="MOTOR" val={u.motor} /><SlipRow k="CHASSIS" val={u.chassis} />
            {i < n - 1 && <hr />}
          </Fragment>
        ))}<hr />
        <SlipRow k="AGREED PRICE" val={t.price ? formatPeso(t.price) : ""} />
        {t.tv > 0 && <SlipRow k="LESS TRADE-IN" val={minus(t.tv)} />}
        {t.loan > 0 && <SlipRow k="LESS LOAN" val={minus(t.loan)} />}
        {(t.tv > 0 || t.loan > 0) && <SlipRow k={t.due < 0 ? "WE PAY BUYER" : "AMOUNT DUE"} val={formatPeso(Math.abs(t.due))} bold />}
        {t.earlier > 0 && <SlipRow k="EARLIER PAYMENTS" val={minus(t.earlier)} />}
        <SlipRow k="PAID TODAY" val={t.today ? minus(t.today) : ""} />
        {t.payout > 0 && <SlipRow k="PAID OUT TO BUYER" val={formatPeso(t.payout)} />}
        <SlipRow k={U(bi.label)} val={t.price ? formatPeso(bi.amount) : ""} bold /><hr />
        {rows.map((r, i) => <Fragment key={i}><SlipRow k={U(r.label)} val={formatPeso(r.amount)} />{r.detail && <div className="dim">{r.detail}</div>}</Fragment>)}
        <div className="r bold tot"><span>PAID TODAY</span><span>{t.today ? formatPeso(t.today) : NB}</span></div>
        <div className="small" style={{ marginTop: ".25rem" }}>{U(words(t.today))}</div><hr />
        <div>BALANCE OF</div><div className="small">{t.balance > 0 ? U(words(t.balance)) : t.price ? (t.balance === 0 ? "NIL, PAID IN FULL" : "—") : NB}</div>
        {t.balance > 0 && <SlipRow k="DUE ON/BEFORE" val={U(dueTextOf(s))} />}<hr />
        <div className="bold">{U(saleLine(s, t))}</div>
        {t.loan > 0 && <SlipRow k={`LOAN BY ${U(s.institution || "LENDER")}`} val={formatPeso(t.loan)} />}
        {t.fee > 0 && <SlipRow k="PROC. FEE (TO LENDER)" val={formatPeso(t.fee)} />}
        {s.hasTi && <><div style={{ marginTop: ".25rem" }}>TRADE-IN: {tradeText[0]}</div><div className="dim">{tradeText.slice(1).join(" · ")}</div><SlipRow k="VALUE" val={formatPeso(t.tv)} /></>}
        {s.hasLieu && t.lieu > 0 && <><div style={{ marginTop: ".25rem" }}>IN LIEU OF DOCS {formatPeso(t.lieu)}</div><div className="dim">DOCUMENTS HELD AS COLLATERAL UNTIL {U(s.lieuUntil ? formatDate(s.lieuUntil) : "")}</div></>}
        {s.hasRem && s.remarks.trim() && <><hr /><div>REMARKS</div><Remarks text={s.remarks} bullet="" /></>}
        {notes.length > 0 && <><hr />{notes.map((x, i) => <div key={i} className="small">* {x.text}</div>)}</>}
        <div className="sg">RECEIVED BY</div><div className="sg">BUYER&apos;S CONFORMITY</div><hr /><div className="bar" />
        <div className="c" style={{ marginTop: ".25rem", letterSpacing: ".15em" }}>*** {U(copy)} ***</div><div className="c small">THANK YOU</div>
      </article>
    );
  }

  return (
    <article className={`paper ${layout}`}>
      {unapproved && <div className="wm">UNAPPROVED</div>}
      <header className="top">
        <div className="logo"><b>{initials(co.name)}</b><div><strong>{co.name}</strong><em>{co.tagline}</em></div></div>
        <div className="no"><span className="k">No.</span><div className="n">{s.receiptNo || "____"}</div><div>{date}</div></div>
      </header>
      {co.address && <div className="addr">{co.address}</div>}
      <div className="g">
        <div className="f s4"><span className="k">Received from</span><div className="v">{v(s.receivedFrom)}</div></div>
        <div className="f s2"><span className="k">Contact no.</span><div className="v mono">{v(s.contact)}</div></div>
        <div className="f s6"><span className="k">Postal address</span><div className="v">{v(s.address)}</div></div>
        <div className="f s4"><span className="k">The sum of pesos</span><div className="v">{v(words(t.today))}</div></div>
        <div className="f s2"><span className="k">In numbers</span><div className="v mono">{t.today ? formatPeso(t.today) : NB}</div></div>
      </div>
      <div className="kinds">
        {(Object.keys(KIND_LABELS) as PaymentKind[]).map((k) => <span key={k} className="bx"><i>{s.kind === k ? "✕" : ""}</i> {KIND_LABELS[k]}</span>)}
        <span className="r">in purchase of <b>({n})</b> unit{n === 1 ? "" : "s"}, described as follows:</span>
      </div>
      {s.units.map((u, i) => (
        <div key={i} className="g veh">
          <div className="f s4"><span className="k">{n > 1 ? `Unit ${i + 1} of ${n} · ` : ""}Make / type</span><div className="v">{v(u.makeType)}</div></div>
          <div className="f s2"><span className="k">Color</span><div className="v">{v(u.color)}</div></div>
          <div className="f s2"><span className="k">Plate number</span><div className="v mono">{v(u.plate)}</div></div>
          <div className="f s2"><span className="k">Motor number</span><div className="v mono">{v(u.motor)}</div></div>
          <div className="f s2"><span className="k">Chassis number</span><div className="v mono">{v(u.chassis)}</div></div>
        </div>
      ))}
      <div className="two">
        <div>
          <span className="k">Price</span>
          <div className="ln"><span>Agreed price{n > 1 ? ` (${n} units)` : ""}</span><b>{t.price ? formatPeso(t.price) : NB}</b></div>
          {t.tv > 0 && <div className="ln"><span>Less: trade-in value</span><b>{minus(t.tv)}</b></div>}
          {t.loan > 0 && <div className="ln"><span>Less: loan <small>· {s.institution || "lender"}</small></span><b>{minus(t.loan)}</b></div>}
          {(t.tv > 0 || t.loan > 0) && <div className="ln due"><span>{t.due < 0 ? "We pay the buyer" : "Amount due from buyer"}</span><b>{formatPeso(Math.abs(t.due))}</b></div>}
          <div className="ln"><span>Less: payment <small>{t.earlier && t.today ? "· earlier + today" : ""}</small></span><b>{t.paid ? minus(t.paid) : NB}</b></div>
          {t.payout > 0 && <div className="ln"><span>Add: paid out to buyer</span><b>{formatPeso(t.payout)}</b></div>}
          <div className="ln bal"><span>{bi.label}</span><b>{t.price ? formatPeso(bi.amount) : NB}</b></div>
        </div>
        <div>
          <span className="k">Paid through</span>
          {t.earlier > 0 && <div className="ln"><span>Earlier payments</span><b>{formatPeso(t.earlier)}</b></div>}
          {rows.map((r, i) => <div key={i} className="ln"><span>{r.label}{r.detail && <small> · {r.detail}</small>}</span><b>{formatPeso(r.amount)}</b></div>)}
          {!t.earlier && rows.length === 0 && <div className="ln">{NB}</div>}
          {t.today > 0 && (t.earlier > 0 || rows.length > 1) && <div className="ln"><span><b>Paid today</b></span><b>{formatPeso(t.today)}</b></div>}
        </div>
      </div>
      <div className="g">
        <div className="f s3"><span className="k">Balance of (in words)</span><div className="v">{t.balance > 0 ? words(t.balance) : t.price ? (t.balance === 0 ? (t.due < 0 ? "Nil, settled" : "Nil, paid in full") : "—") : NB}</div></div>
        <div className="f s1"><span className="k">In numbers</span><div className="v mono">{t.price ? formatPeso(Math.max(0, t.balance)) : NB}</div></div>
        <div className="f s2"><span className="k">Shall be given on or before</span><div className="v">{t.balance > 0 ? v(dueTextOf(s)) : NB}</div></div>
      </div>
      <div className="terms">
        <div><b>Sale:</b> {saleLine(s, t)}{t.loan > 0 && ` · Loan ${formatPeso(t.loan)}, paid by ${s.institution || "the lender"}`}{t.fee > 0 && ` · Processing fee ${formatPeso(t.fee)}, owed to the lender`}</div>
        {s.hasTi && <div><b>Trade-in:</b> {tradeText[0] || "—"}{tradeText.slice(1).map((x) => ` · ${x}`)} · valued {formatPeso(t.tv)}, taken off the price</div>}
        {s.hasLieu && t.lieu > 0 && <div><b>In lieu of documents:</b> documents held as collateral for {formatPeso(t.lieu)} until {s.lieuUntil ? formatDate(s.lieuUntil) : "—"}</div>}
      </div>
      {s.hasRem && s.remarks.trim() && <div className="rem"><span className="k">Remarks</span><Remarks text={s.remarks} /></div>}
      {notes.length > 0 && <ul className="notes">{notes.map((x, i) => <li key={i}>• {x.text}</li>)}</ul>}
      <div className="sign"><div>Received by (signature over printed name)</div><div>Buyer&apos;s conformity</div></div>
      <footer className="cp"><span>{copy}</span><span>{co.name}</span></footer>
    </article>
  );
}
