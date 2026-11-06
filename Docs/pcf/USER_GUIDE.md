# PCF (petty cash): user guide

One short page per PCF role.

## Getting in (everyone)

PCF (petty cash) is the **PCF** section of MAD; the other section is **Invoice**. Sign in to MAD with your email and
password as usual. The PCF menu appears when an Admin has given you a **PCF role**
(Custodian, Approver or Accounting) on the **Users** page. An Admin of MAD is a PCF
administrator automatically.

## The one rule to remember

**Cash on hand + released vouchers = the fund amount.** The dashboard shows this
equation for the fund. If a physical count doesn't match, record it on the Cash
Count page and explain the difference.

## Large vouchers need approval first

Each fund has an **approval limit** (default ₱3,000, set by the admin on the Funds
page; separate from the per-transaction limit, which is the most a single voucher
may be). Vouchers **below** the limit are released straight away and reviewed later.
Vouchers **at or above** it follow a stricter path:

1. The custodian prepares the voucher and taps **Submit for approval**.
2. An approver (never the preparer) approves it, or **returns** it with a reason.
   A returned voucher goes back to draft so the custodian can fix and resubmit.
3. Only after approval can the custodian **Release cash**. Until then the money is
   not counted as released.

## Email notifications (everyone)

You get an email when something needs you or something important happens to
your work — for example an approver gets one when a voucher is released, a
custodian when a voucher is flagged, accounting when a replenishment is
submitted, and admins when a cash count doesn't match or the fund runs low.
You are never emailed about something you did yourself. Each morning at 8:00 you
also get one short summary of what is still waiting on you, but only if there is
something.

Admins can see every email the app sent, and any that failed, under
**PCF → Email log**.

---

## Custodian

You hold the fund and hand out the cash.

**Record an expense**
1. **Vouchers → New voucher**. Fill in date and payee, then add a line for each
   thing bought: particulars, amount, and category. Use **Add line** when one
   payee was paid for several items; the voucher total is the sum of the lines
   (up to 20) and can't exceed the per-transaction limit. Reports split the
   spending by each line's category.
   **Shortcut:** on the Vouchers page, **Scan paper voucher** takes a photo of
   your signed paper petty cash voucher and fills the form from it, one line per
   particular (the same button sits at the top of the New voucher form). The
   paper photo is only read, not saved. Handwriting can be misread, so always
   check the payee, date, amounts and categories.
2. Attach a receipt photo (on a phone this opens the camera). If the form is
   still empty, the app also reads a store receipt and fills the form from it.
   Use **Fill form from receipt** to run it again (it replaces what you typed).
   No receipt? Give a reason instead.
   A draft can be corrected later: open it and tap **Edit** to change the payee,
   date or lines (the receipt and release stay on the voucher page). Once a
   voucher is submitted or released it is locked.
3. **Save draft** to finish later, or **Save and release cash** to hand over
   the money now. Releasing lowers your expected cash by that amount.

**Count the cash** — **Cash count**: enter what is physically in the box. If it
differs from the expected amount you must add a note.

**Restore the fund** — when cash runs low, **Replenishments → New
replenishment**. It bundles every released, approved, or flagged voucher not yet
reimbursed. Check the totals, then **Submit to accounting**.

You only see the funds an administrator has assigned to you. If you have none,
the dashboard says so; ask an administrator. When your funds change you get an
email.

A flagged voucher shows the approver's reason. It can't be edited; ask an admin
to void it, or ask the approver to approve it once the issue is resolved.

## Approver

Approvers can also **prepare their own vouchers** (Vouchers → New voucher), with the
same steps as a custodian: lines, receipt, edit a draft, release or submit for
approval. You can never approve a voucher you prepared; another approver or an
admin has to. Large ones submitted by you go to the other approvers and admins.


You review expenses after the cash is out.

1. **Voucher approvals** lists released vouchers, oldest first.
2. Open one and check the receipt and details.
3. **Approve** if it's fine, or **Flag** with a reason if something is wrong.
   Flagging doesn't take the cash back — it stays counted until an admin voids
   the voucher.

You can't review a voucher you prepared yourself.

## Accounting

You review replenishment requests and watch the numbers.

1. **Replenishments** → open a submitted request. Check the vouchers, receipt
   thumbnails, and totals by category.
2. **Approve**, or **Reject** with a note (the vouchers go back to the pool so
   the custodian can bundle them again).
3. After approving, **Mark as replenished and close** once the cash has been
   handed back. The vouchers become closed and the fund is whole again.

Also yours: **PCF reports** (spend by category, month, and payee, plus cash-count
variances, with CSV export) and the **Audit Trail** (every change, with who and
when).

## Administrator

You can do everything above, plus set the system up.

- **Users** (the MAD Users page): create the account with a password, then pick the
  person's **PCF** role beside their main role. For a custodian, click **Assign funds** (or
  **Funds (n)**) and tick the funds they should have. A custodian can
  hold many funds, and a fund can have several custodians; ticking a fund never
  takes it from another custodian. Before you deactivate a custodian or change
  their role, take them off their funds.
- **PCF → Funds**: create the fund, set its amount, per-transaction limit,
  low-balance warning level, and its custodians (tick as many as you need; each
  can prepare and release their own vouchers, count cash and request
  replenishments for it). Changing the fund amount changes the equation, so
  you're warned first.
- **PCF → Categories**: add, rename, or deactivate (never delete) categories.
- **Voiding**: only admins can void a voucher that has been released, and a
  reason is required. Voided records are kept for the audit trail.
