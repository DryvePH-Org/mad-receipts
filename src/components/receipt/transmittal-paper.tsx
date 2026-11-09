import "./paper.css";
import { FitBox } from "./fit-box";
import { halfOf, type PaperKey } from "@/lib/paper";
import { cleanTransmittal, TRANSMITTAL_ITEMS, type TransmittalData } from "@/lib/docs/transmittal";
import { formatDate } from "@/lib/dates";

const NB = " ";

/** The Acknowledgement / Transmittal Receipt, laid out like the paper form, filled in on screen. Half of a sheet, like the receipt. */
export function TransmittalPaper({ data, paper = "a4", copy, onFit }: { data: TransmittalData; paper?: PaperKey; copy?: string; onFit?: (scale: number) => void }) {
  const d = cleanTransmittal(data);
  const half = halfOf(paper);
  const box = (key: string) => <i>{d.items[key]?.on ? "✕" : ""}</i>;
  const left = TRANSMITTAL_ITEMS.filter((i) => i.side === "left");
  const right = TRANSMITTAL_ITEMS.filter((i) => i.side === "right");
  const others = d.others.filter((o) => o.trim());
  const date = (iso: string) => (iso ? formatDate(iso) : "");
  return (
    <article className="paper ack tm" style={{ ["--pw" as string]: `${half.w}mm`, ["--ph" as string]: `${half.h}mm` }}>
      <FitBox onFit={onFit}>
        <h2 className="tmtitle">ACKNOWLEDGEMENT/TRANSMITTAL RECEIPT</h2>
        <p className="tmlead">THIS IS TO ACKNOWLEDGE RECEIPT OF THE FOLLOWING DOCUMENTS RELATIVE TO:</p>
        <div className="tmhead">
          <div className="arow"><label>MAKE/TYPE:</label><span className="ul grow">{d.makeType || NB}</span></div>
          <div className="arow"><label>PLATE NO.:</label><span className="ul grow mono">{d.plate || NB}</span></div>
          <div className="arow"><label>COMPLETE OWNERS NAME:</label><span className="ul grow">{d.owner || NB}</span></div>
        </div>
        <div className="tmcols">
          <ul className="tmlist">
            {left.map((it) => (
              <li key={it.key}><span className="bx2">{box(it.key)}</span><span className="tmlabel">{it.label}</span>{it.line && <span className="ul grow mono">{d.items[it.key]?.detail || NB}</span>}</li>
            ))}
          </ul>
          <ul className="tmlist tmright">
            {right.map((it) => (
              <li key={it.key}><span className="bx2">{box(it.key)}</span><span className="tmlabel">{it.label}</span></li>
            ))}
          </ul>
        </div>
        <div className="arow tmothers"><span className="bx2"><i>{others.length ? "✕" : ""}</i></span><label>Others</label><span className="ul grow">{others[0] || NB}</span></div>
        {others.slice(1).map((o, i) => <div key={i} className="arow tmmore"><span className="ul grow">{o}</span></div>)}
        <div className="arow"><label>NOTE:</label><span className="ul grow">{d.note || NB}</span></div>
        <div className="tmsign">
          <div><div className="arow"><label>Prepared by:</label><span className="ul grow">{d.preparedBy || NB}</span></div><small>Print Name and Signature</small></div>
          <div><div className="arow"><label>Date Received:</label><span className="ul grow">{date(d.preparedOn) || NB}</span></div></div>
          <div><div className="arow"><label>Received by:</label><span className="ul grow">{d.receivedBy || NB}</span></div><small>Print Name and Signature</small></div>
          <div><div className="arow"><label>Date Received:</label><span className="ul grow">{date(d.receivedOn) || NB}</span></div></div>
        </div>
        {copy && <footer className="afoot"><span /><small>{copy}</small></footer>}
      </FitBox>
    </article>
  );
}
