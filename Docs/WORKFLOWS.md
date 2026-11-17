# Workflows of the MAD app

Flowcharts of every workflow, as they are today and as they are planned. They are Mermaid charts: GitHub and most editors draw them. Updated 18 Nov 2026.

Legend: **purple = a person does it, teal = the app does it, amber = a decision or an outside service**.

## 1. The big picture

```mermaid
flowchart TB
  S[Sales: receipts, sold papers]:::person --> APP
  A[Approver: approves receipts]:::person --> APP
  D[Documentation: car documents]:::person --> APP
  AD[Admin: users, settings]:::person --> APP
  subgraph APP[MAD web app - one database]
    R[Receipts and deals]:::app
    C[Car documents + Docs Bible]:::app
    DB[Dashboards: Car status, Buy, Sell]:::app
  end
  APP --> GD[Google Drive: document photos via Apps Script]:::ext
  APP --> BOT[Scanner bot: reads the photos]:::ext
  APP --> TG[Telegram: team messages]:::ext
  APP --> GS[Google Sheets: receipt log, inventory note; dashboards are read]:::ext
  APP -.runs on.-> SRV[Hostinger server, auto-deploy from GitHub, Cloudflare in front]
  classDef person fill:#eeedfe,stroke:#534ab7,color:#26215c
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef ext fill:#faeeda,stroke:#854f0b,color:#412402
```

## 2. Receipt and deal (money)

```mermaid
flowchart TB
  A[Sales fills New receipt, by hand or by voice]:::person --> B[Proof for each payment, live preview, checks]:::person
  B --> C[Send for approval - the database checks the money]:::person
  C --> D{Approver reviews - never the writer}:::dec
  D -- rejected --> A
  D -- approved --> E[Counts in the deal balance]:::app
  E --> J1[Log sheet row]:::app
  E --> J2[Inventory note: Reserved or Sold]:::app
  E --> J3[Telegram photo and summary]:::app
  E --> J4[Car folder linked for the sold papers]:::app
  E --> F[Deal status follows balance and due date: Open, Due soon, Overdue, Waiting for lender, Settled, Cancelled]:::app
  F --> G[Reminders warn]:::app
  H[Admin only: void a receipt, cancel a deal, mark the loan released]:::person -.-> F
  classDef person fill:#eeedfe,stroke:#534ab7,color:#26215c
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef dec fill:#faeeda,stroke:#854f0b,color:#412402
```

## 3. Documents IN: a new car to approval

```mermaid
flowchart TB
  A[1. Add a car: type the plate, Check]:::person --> B[2. The car's details: make, model, year, color needed]:::person
  B --> C[3. Photos of the papers into the Drive folder]:::person
  C --> D[4. Scanner bot reads the photos, 1 to 3 minutes]:::app
  D --> E[5. Papers list fills in: in the folder or missing, with warnings]:::app
  E --> F[6. Staff review: correct what the bot read, mark a warning checked, change a photo's type]:::person
  F --> G{7. Choose the case - a person decides, the bot only suggests}:::dec
  G --> H[8. About the car: spare key, battery, where bought]:::person
  H --> I{9. Approve - needs the case chosen and every photo scanned}:::dec
  I --> J[Docs Bible row filled: classification, papers, dated note]:::app
  I --> K[Telegram: marketing told]:::app
  J --> L[Ready to market]:::app
  K --> L
  classDef person fill:#eeedfe,stroke:#534ab7,color:#26215c
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef dec fill:#faeeda,stroke:#854f0b,color:#412402
```

Photos can be added at any time. The car page looks at the Drive folder every minute: photos taken out of Drive leave the page, and new ones are scanned.

## 4. Documents OUT: sold papers to handoff

```mermaid
flowchart TB
  A[1. Car sold: Sales makes the AR in the app]:::person --> B[2. Folder linked to the deal by plate]:::app
  B --> C[3. Sales adds the sold papers on the car page: signed AR, buyer ID, deed]:::person
  C --> D[4. The bot scans them]:::app
  D --> E{5. All three in?}:::dec
  E -- no --> C
  E -- yes --> F{6. Move to Sold - needs approval first, Admin can override}:::dec
  F --> G[7. Handoff to Sir Jep: tick each paper, print the transmittal]:::person
  G --> H[8. Telegram reminder every 3 days]:::app
  H --> I[9. Papers are back: Documentation marks done]:::person
  I --> J[Done - history and handoff record kept]:::app
  classDef person fill:#eeedfe,stroke:#534ab7,color:#26215c
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef dec fill:#faeeda,stroke:#854f0b,color:#412402
```

Sales see the whole car page (photos, what the bot read, the papers, the Docs Bible row) with no button except Sold papers.

## 5. How a scan runs and how the page stays up to date

```mermaid
flowchart LR
  A[Scan pressed or new photos found]:::app --> B[Job waits in the queue, up to 6 photos together]:::app
  B --> C[Signed photo links sent to the bot, valid 90 minutes]:::app
  C --> D[Bot reads each photo, no memory of other cars]:::ext
  D --> E[Bot answers on the callback address, one line in its chat]:::ext
  E --> F[Answer saved: type, copy, damage, numbers]:::app
  F --> G[Open pages ask every few seconds if anything changed, then reload]:::app
  E -. refused: retries; unanswered jobs are given up after 15 minutes .-> B
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef ext fill:#faeeda,stroke:#854f0b,color:#412402
```

## 6. The Docs Bible data

```mermaid
flowchart TB
  A[Live Google Sheet: now a read-only archive]:::ext --> B[Frozen snapshot, every cell balanced]:::app
  B --> C[Docs Bible in the database: 400 cars, source of truth]:::app
  C --> D[Table like the sheet: click a cell, undo]:::person
  C --> E[Car page: papers, notes, details]:::person
  C --> F[Review list: duplicates, differing statuses]:::person
  D --> G[Every change in the car's history: who, when, before, after]:::app
  E --> G
  F --> G
  G --> H[Backup: one CSV a day for 30 days, download in the old sheet's layout]:::app
  classDef person fill:#eeedfe,stroke:#534ab7,color:#26215c
  classDef app fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef ext fill:#faeeda,stroke:#854f0b,color:#412402
```

Who edits: Documentation the papers and notes, Admin everything, Sales and Approver only look.

## 7. Status

**Working now:** receipts and approvals, voice entry, reminders and deal status, Buy and Sell dashboards, Car status, receipt log and inventory note, Telegram, the Docs Bible table and review list, the scanner bot and its queue, the daily CSV backup, roles and per-person access, auto-deploy, the transmittal print, folders linked to the live Drive.

**Being tested:** Add a car (details and photos), the Papers part and live updates, folder checks every minute, sold papers on the car page, Sales seeing photos with no buttons. Not yet tested: Move to Sold, handoff with the 3-day reminders, papers are back.

**Planned, not built:** stencil as a document (scan, checklist, column), receipt to Drive as a button for Documentation only (it no longer happens by itself), a help page ("where did my sheet column go?") and a first-visit tour, table paste / arrow keys / phone cards, retiring the old sheet-editor bot settings, the cut-over (the old sheet becomes read only), scanning the 367 photos still waiting.

Not changed by this project: the receipt log sheet and the inventory note.
