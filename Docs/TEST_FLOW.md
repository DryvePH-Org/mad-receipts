# Test flow: Car documents and the Docs Bible

Run these in order. Each step says what to do, what you should see, and what it proves. Use a car you can afford to change: every edit goes into the real register (the history keeps it, and the table's Undo takes a cell back). Write down the plate you used and anything that looks wrong or confusing: *confusing* counts as a finding, because staff will have to learn this.

Accounts needed: **Admin**, **Documentation**, **Sales**, **Approver**. Use a second browser (or a private window) for the second person.

Before you start: the push is deployed, and migrations 30, 31 and 32 are applied.

---

## 1. Look around, one role at a time (5 minutes)

| Do | You should see |
|---|---|
| Log in as **Documentation**. Open **Car documents** in the menu. | One menu item called Car documents. The list shows about 400 cars with plate, car, case, a stage chip, papers like `5/7`, and a warning sign on some. |
| Click the stage chips (Needs scan, In review, Approved…) and type a plate in the search box. | The list narrows; the counts on the chips make sense. |
| Click **Table (like the sheet)**. | The table with the sheet's columns and order. Scroll right: the plate stays in place. Switch the column set (Checklist, Handoff, Everything). |
| Log in as **Sales** in the other browser. Open **Car documents**, click a car. | The same list and the car page, but **no photos and no buttons**; it says photos are for Documentation. |
| Log in as **Approver**. Same page. | Read only too. |

**Proves:** one module for everyone, each role sees the right amount.

## 2. The review list (10 minutes, as Documentation)

Open **Car documents** → the amber box → **Open the review list** (about 56 items).

| Item type | Do | You should see |
|---|---|---|
| Status differs | Pick one and press the status that is right. | The item moves to *Settled*; the car's other status column changes to match. |
| Needs a classification | Choose a classification for a car you are sure about. | Saved; the car's CLASSIFICATION changes in the table. |
| Same plate twice | Read the two rows. Press **Keep both**, or on a real double entry **Double entry: remove**. | Keep both: item settled. Remove: that row disappears from the table but stays in the car's history. |
| Row without a plate | Type the plate of a car you know. | A new car appears in the table with that row's information. |
| Date / plate to check | Correct or confirm. | Saved. |

**Proves:** the things the move could not decide are visible and each has a clear choice. (Settling is permanent: only do the ones you are sure about.)

## 3. Edit the table like a sheet (5 minutes)

As **Documentation**, in the table view, search one plate.

1. Click a paper cell (for example CR). A drop-down opens: choose **Yes**. The cell changes at once and a message appears with **Undo**. Press **Undo**: it goes back.
2. Click the plate: the car's **history** opens with who, when, from what to what.
3. Switch to **Everything**. Try to click MAKE: it is **not editable** (Documentation edits the papers; Admin edits everything).
4. Open the same car as **Admin** and change MAKE: it works.
5. With the car open in two browsers, change the same cell in both, one after the other: the second one is **refused** with "Someone changed this cell a moment ago".

**Proves:** edits are instant, undoable, recorded, and nobody overwrites anybody silently.

## 3b. The scanner on its own (10 minutes, changes nothing in the Docs Bible)

Scanning only reads the photos and fills in the car's page. The Docs Bible row changes **only** when you press **Approve** or **Fill the papers from this scan**, so you can scan as much as you like.

Before you start: the scanner bot has the text of `Docs/GROKBOT_SCANNER_ROUTINE.md` (version 5.1) saved, and the server has `DOCS_READER=grokbot` and the scanner address set (Admin → Sync jobs → Grokbot → Test the connection should answer).

Use a car whose row in the Docs Bible is already filled in by the staff: **that row is your answer key.** Cars with photos nobody has scanned yet:

| Plate | Case in the Docs Bible | Photos | What the scan should find |
|---|---|---|---|
| **NBR3929** (Honda HR-V) | Clean | 4 | CR, OR, deed, seller's ID: all in |
| **NAI6184** (Ford Everest) | Encumbered | 6 | the four above + chattel cancellation and promissory note |
| **NBM7701** (Honda City) | Encumbered | 5 | CR and seller's ID are "To follow" in the sheet: the scan should show them **missing** |

1. Open the car, press **Scan**. The blue box says the bot is scanning; wait 1 to 3 minutes. The photos fill in by themselves.
2. For each photo open **What the bot saw**: the document type, original or photocopy, damage, the numbers and names. Compare with the photo (click it to see it large).
3. Look at **Papers needed**: does the checklist match the answer key? A paper the sheet says **Yes** that the scan does not find (or the other way round) is a finding: tell me the plate and the photo.
4. Note what the bot got wrong: a wrong type, a number you can read that it left blank, a made-up number, a photo turned the wrong way, a warning that makes no sense.
5. Try **Scan this photo again** on one photo: it should come back the same.
6. Do **not** press Approve if you want the row to stay as the staff typed it (or approve, then undo the cells from the history).

A scan also sends one Telegram message per car ("Scanned: …"), so tell marketing you are testing.

## 4. One existing car, all the way in (15 minutes, as Documentation)

Pick a car that has photos in Drive but is not approved yet (the chip **Needs scan** or **In review**). Open it.

| Step | Do | You should see |
|---|---|---|
| a | Read the bar at the top and the box **Do this next**. | It tells you the next step in plain words. |
| b | Press **Scan** (if photos are waiting). | The blue box says the bot is scanning. After a minute or two the photos fill in by themselves: each shows what the bot found (open **What the bot saw**). |
| c | Look at the **Papers needed** card. | The case dropdown says **Choose the case…**. The bot's suggestion is shown *with its reason* ("The deed names a bank as the seller…"). **Approve is blocked** until you choose the case. |
| d | Choose the case (use the bot's suggestion if right). | Saved; the checklist updates. |
| e | On a photo with a warning, press **Checked, it is fine**, or **Correct what the bot read**, change a field, **Save the correction**. | The warning disappears; the photo says *Corrected by a person*. **Scan this photo again** reads it from scratch. |
| f | Fill **About the car** (spare key, maintenance, battery…) and **Save the details**. | Saved. |
| g | Look at the **Docs Bible** card on the car page. | The car's row, all columns, editable. |
| h | Press **Approve**. | A message says the Docs Bible was updated and marketing was told on Telegram. The stage is **Approved**. |
| i | Open the car in the **Table**. | CLASSIFICATION and the papers match what was in the folder; REMARKS I has a dated scan note; COMPLETE shows. Open the history: each changed column is listed as changed *by the app*. |
| j | As **Sales**, open the same car. | The stage and the papers, read only. In **Car status** the car shows its documents status. |

**Proves:** scan, review, case chosen by a person, approval, and the register filled at once, no waiting and no Google Sheet.

## 5. Sold and handoff (10 minutes)

Use a car that has an **AR** (a deal) in the app.

1. As **Sales**: **Upload documents** → type the plate → **Find the car** → add the signed AR, the buyer's ID and the deed.
2. As **Documentation**: on the car, the stage says the sold papers are in. Press **Move to Sold**. The button is **disabled until the car is approved** and the sold papers are in (the reason is written next to it).
3. **Handoff**: tick each paper, press **Handed off**. A Telegram reminder is sent every 3 days (check **Documents on handoff**).
4. Press **Papers are back** when they return.
5. The car's **Handoff** card shows when it was handed over and returned. (The handoff steps are also stored in the database as dated events; there is no screen that lists them yet. Tell me if you want one in the car's history.)

**Proves:** the OUT flow, the rules that keep the buttons in order, the handoff.

## 6. A brand new car, with its documents and information (20 minutes)

This is the start of the workflow for every car, and the last test: a car that is not in the system at all.

1. As **Documentation**: **Car documents** → **Add a car**. Type the **new plate** and press **Check**.
   - You should see: **1. Which car?** says whether a Drive folder exists or will be made, and **2. The car** says *This plate is not in the Docs Bible yet*. The photos step says *Save the car first*.
2. Press **Save the car** with the form empty. It tells you what is missing (make, model, year, color). Fill them (suggestions appear as you type), plus whatever else you know (body type, transmission, fuel, mileage, registered owner, bought from, spare key, arrival date; **More details** has the rest). Press **Save the car**.
   - You should see: *… is in the Docs Bible. Now add its photos.* In **Car documents → Table**, the car is there with its details, vehicle status AVAILABLE and today's arrival date, and no classification yet.
3. **3. The photos**: choose the photos of its papers (OR, CR, ID, deed; add the stencil and any bank papers).
   - You should see: the folder is **found or created in Drive** (named like `21 Toyota Vios (ABC1234)`), each photo is filed and read, and the team gets one Telegram message when the batch ends.
4. Open the car (**Open this car**). Scan the photos, choose the **case**, review the warnings, fill **About the car**, then press **Approve**.
5. After approving, the car's row has its classification, its papers and the dated scan note. 
6. Check it everywhere:
   - **Table**: the new car is there, complete, with its details.
   - **Download as CSV**: the new row is in the file, in the old sheet's columns.
   - **History** of the car: from "created" to every change.
   - As **Sales**: the car shows in the list and in Car status with its documents status. Sales cannot open **Add a car**.
7. Try the same plate again in **Add a car**: it says the car is **already in the Docs Bible** and does not add it twice. Press *this car arrived again* only for a car that really came back: it adds a second row and keeps the first (and the review list will mention the two).

**Proves:** a new car can be taken from nothing to a complete, approved, visible record, with its details typed once, at the start.

---

## What to tell me afterwards
- Any step where you didn't know what to press next.
- Any word you would change (staff will read it every day).
- Anything slow (a scan that took more than 3 minutes, a page that took more than a few seconds).
- Anything that surprised you, even if it "worked".

If something fails, send me the plate, the step number and what was on the screen. The history of the car (click the plate in the table) and **Admin → Sync jobs → Grokbot queue** usually show what happened.
