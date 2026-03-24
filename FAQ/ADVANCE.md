# Advance & Expense Module - Complete Procedure & FAQ

Welcome to the Advance & Expense Management guide. This document explains how the system handles money moving between the company and employees, ensuring perfect synchronization between approvals, bank payouts, and monthly salary slips.

---

## 📚 Core Concepts: The Two Types of Transactions

To keep the Accountant's books perfectly balanced, the system uses specific definitions:

1. **Advance (Debt)**
   - **What it is:** The company gives money to the employee ahead of payday.
   - **Result:** The employee *owes* the company. This amount will be **deducted** from their next salary slip.
   - *Example:* "I need ₹5,000 as a salary advance for a family emergency."

2. **Expense (Reimbursement)**
   - **What it is:** The employee spent their own money on company business and needs to be paid back.
   - **Result:** The company *owes* the employee. This amount will be **added** to their next salary slip (or paid immediately).
   - *Example:* "I spent ₹800 on printer ink for the office."

---

## ⚙️ The Workflows

The system handles three distinct workflows based on **when** the money is spent and **how** it is paid back.

### Workflow 1: The "Pre-Approval" (Permission to Spend)
*Use this when an employee wants permission before spending their own money.*

1. **Request:** Employee submits an Expense, selects Type: **Pre-Approval**.
2. **Approval:** HR and MD review and approve the estimate. 
   - *Note: It does NOT go to the Accountant yet. No money has moved.*
3. **Action:** Employee spends the money and returns with the bill.
4. **Finalize:** Employee goes to the Reports tab and clicks **"Submit Bill"**, entering the *actual* amount spent.
5. **Result:** The request converts into a standard "Immediate Reimbursement" and moves to the Accountant's queue for payment.

### Workflow 2: The "Immediate Reimbursement" (Pay Me Now)
*Use this for large expenses where the employee needs the money back right away.*

1. **Request:** Employee submits an Expense, selects Type: **Reimbursement**, Payout: **Immediate**.
2. **Approval:** HR and MD approve it.
3. **Queue:** It lands in the Accountant's "Payment Queue".
4. **Payout & Automation:** The Accountant transfers the money (e.g., via bank/UPI) and clicks "Mark as Paid".
   - **The Magic:** Because money left the company bank account today, the system *automatically* creates a mirrored "Advance" (Debt) for that employee. 
5. **Salary Slip Balance:** 
   - At month-end, the salary slip adds the Expense to Earnings (+₹800).
   - It deducts the mirrored Advance from Deductions (-₹800).
   - *Net Impact on Salary = ₹0.* But the Accountant's bank statement balances perfectly!

### Workflow 3: The "With Salary" Aggregation (Petty Cash)
*Use this for small bills (tea, stationery) that HR collects and bundles into the month-end salary.*

1. **Request:** HR/Employee submits an Expense, selects Type: **Reimbursement**, Payout: **With Salary**.
2. **Approval:** HR/MD approve it.
3. **Holding State:** It *skips* the Accountant's queue. It waits in the Reports tab.
4. **Salary Generation:** When HR generates the monthly salary slip, the system automatically sums all approved "With Salary" expenses and adds them as a single line item ("Expense") in the Earnings section.
5. **Auto-Clear:** Once the salary slip is confirmed, the system automatically marks those small bills as "Paid" so they aren't carried over to the next month.

---

## 🛠️ The Safety Net: Granular Revocation

Mistakes happen. Sometimes a bill is rejected *after* the Accountant has already paid it.

If you click **Edit** or **Delete** on an Expense that is already marked as "Paid", the system will ask you what you want to do with the *Mirrored Advance* (the record that money left the bank).

*   **Scenario A (Typo):** The Accountant clicked "Paid" by mistake, but no money actually left the bank.
    *   *Action:* Delete the Expense AND check the box to **"Revoke the linked salary advance."** It's as if it never happened.
*   **Scenario B (Fake Bill):** The Accountant paid ₹500, but HR later realizes the bill was invalid and rejects the expense.
    *   *Action:* Delete the Expense, but **DO NOT** revoke the linked advance. 
    *   *Result:* The employee's expense claim is wiped out, but the ₹500 debt remains in the system and will be deducted from their salary. The company gets its money back.

---

## 🚀 Efficiency Features: Bulk Approval

Processing 50 bills at the end of the month one-by-one is tedious. The **Approvals** tab now includes powerful bulk actions:

1. **Select Multiple:** Use the checkboxes on the left of each row to pick specific items.
2. **Approve Selected:** Click the emerald button that appears to approve your selection in one go.
3. **Approve All Pending:** Don't want to check boxes? Use this button to automatically select every pending item in the current view and process them.
4. **Role Safety:** The system is smart. If HR uses "Approve All," it only affects items waiting for HR approval. If MD uses it, it only affects items already cleared by HR.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Why do my Immediate Expenses show up as "Advances" in the backend reconciliation?**
**A:** This is intentional! From an accounting perspective, any outward cash flow to an employee mid-month is an "Advance" on their final settlement. The system automatically mirrors paid immediate expenses as advances so your bank reconciliation matches 1:1, while balancing it out on the salary slip so the employee's net pay is correct.

**Q: I approved a "Pre-Approval" request, but the Accountant says they can't see it in the Payment Queue. Why?**
**A:** Pre-Approvals are just permission slips. They only move to the Payment Queue *after* the employee clicks "Submit Bill" in the Reports tab to confirm exactly how much they actually spent.

**Q: Why don't my "With Salary" expenses show up in the Payment Queue?**
**A:** "With Salary" items are designed to bypass the immediate payment queue. They are held automatically and will appear bundled together as an addition to the employee's next salary slip.

**Q: If I delete an old paid transaction, will it mess up previous salary slips?**
**A:** No. Deleting a transaction moves it to the "Recently Deleted" bin (available for 30 days) and severs active links. However, finalized salary slips are locked documents and will retain their historical numbers.

**Q: What happens if an employee submits a bill for a Pre-Approval, but the amount is higher than what the MD approved?**
**A:** Currently, submitting the bill converts it to a Reimbursement and pushes it to payment based on the trust that the final bill is accurate. If org policy requires strict adherence, HR should verify the final bill amount in the Reports tab before the Accountant processes it.
