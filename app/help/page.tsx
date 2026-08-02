'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

// ── Tutorial content ───────────────────────────────────────────────────────────

interface Step { heading: string; body: string }
interface Tutorial { id: string; title: string; steps: Step[] }

const tutorials: Tutorial[] = [
  {
    id: 'pos',
    title: 'Using the POS Terminal',
    steps: [
      { heading: 'Open the POS', body: 'Click "POS Terminal" in the sidebar. If your business uses branches, select your branch first when prompted.' },
      { heading: 'Add items to the cart', body: 'Tap any item tile to add it, or scan the barcode -- the item is added instantly. Scanning the same barcode again increases the quantity by 1. Use the search bar to find items by name.' },
      { heading: 'Adjust quantity or price', body: 'Tap the quantity number on a cart line and type the exact amount on the numpad. Tap the price to override it (if your role permits).' },
      { heading: 'Apply a discount', body: 'Tap "Discount" on a cart line. Use % for a percentage off or GHS for a fixed amount. An order-level discount can also be applied in the payment panel above the TOTAL.' },
      { heading: 'Select a customer (optional)', body: 'Use the customer search at the top of the cart. Required for credit sales; optional for cash or MoMo.' },
      { heading: 'Choose a payment method', body: 'In the payment panel, tap CASH, MOMO, BANK, or ✂ SPLIT. SPLIT lets you collect part in cash and part via MoMo in a single transaction.' },
      { heading: 'Cash payment', body: 'Select CASH, then enter the amount the customer hands you using the numpad or the quick-fill shortcuts (exact, +10, +20, +50). Change is calculated automatically.' },
      { heading: 'MoMo payment', body: 'Select MOMO and enter the customer\'s mobile number. Tap CHARGE -- a prompt is sent to the customer\'s phone. Wait for them to approve it. The sale completes automatically once payment is confirmed.' },
      { heading: 'Split payment (Cash + MoMo)', body: 'Tap ✂ SPLIT. Enter the MoMo amount first, then the cash amount. Both must add up to the total. Tap CHARGE -- the MoMo request goes first, then you collect the cash remainder.' },
      { heading: 'Complete the sale', body: 'Tap the green CHARGE button. If the sale requires manager approval (discount, credit, price override), a PIN prompt appears. The manager can enter the PIN on your screen or approve it from the Approvals page on their own device.' },
      { heading: 'Receipt and change', body: 'A receipt modal appears. For cash sales, change is shown at the top. Tap "Print Receipt" to print via thermal printer, or close the modal to start the next sale.' },
      { heading: 'Customer display', body: 'Click the 🖥 icon in the POS top bar to open the customer-facing screen. Drag the new tab to your second monitor and press F11 for fullscreen. It syncs in real time as items are added.' },
      { heading: 'Hold an order', body: 'Click the ⏸ Hold button to save the current cart and start a new one. Tap the held-orders icon (shows the count) to recall any held cart.' },
    ],
  },
  {
    id: 'sales',
    title: 'Recording a Manual Sale',
    steps: [
      { heading: 'Go to Sales → New Sale', body: 'Click "Sales" in the sidebar, then the "+ New Sale" button.' },
      { heading: 'Search and add items', body: 'Type an item name in the search box and click it to add. Adjust quantity and price inline.' },
      { heading: 'Choose payment type', body: 'Select CASH for immediate payment, or CREDIT if the customer will pay later. CREDIT requires a customer to be linked to the sale.' },
      { heading: 'Select payment method', body: 'Pick CASH, MoMo, or Bank transfer. For MoMo the customer\'s phone number is recorded for reference.' },
      { heading: 'Save the sale', body: 'Click "Record Sale". Stock is reduced, the journal entry is posted, and a receipt is generated.' },
    ],
  },
  {
    id: 'inventory',
    title: 'Managing Inventory',
    steps: [
      { heading: 'Item types', body: 'INVENTORY items track stock levels. NON_INVENTORY items are physical goods you sell without tracking stock. SERVICE items are non-physical (e.g. consultation fees) and appear on invoices only.' },
      { heading: 'Add a new item', body: 'Go to Items → click "+ New Item". Fill in name, selling price, and cost price. Choose the item type and set the opening quantity for INVENTORY items.' },
      { heading: 'Add stock via Purchases', body: 'When goods arrive from a supplier, go to Purchases → "+ New Purchase". Add items and quantities. Stock is increased automatically when the purchase is confirmed.' },
      { heading: 'Adjust stock', body: 'For corrections after a stock count, go to Admin → Adjust Stock. Select the item, enter the correct quantity, and give a reason. The action is logged in the audit trail.' },
      { heading: 'Categories', body: 'Go to Categories to create product groups (e.g. "Beverages", "Electronics"). Assign items to categories to make POS browsing faster.' },
      { heading: 'Low stock alerts', body: 'Items show a warning badge when quantity falls to or below the reorder level. Go to Reports → Inventory for a full low-stock list.' },
      { heading: 'Barcodes', body: 'Set a barcode on an item\'s detail page. Go to Barcode Labels to design and print sticker sheets for your shelves.' },
      { heading: 'Import items in bulk', body: 'Go to Admin → Import Items. Download the CSV template, fill in your items (including itemType, barcode, reorderLevel), and upload. Preview before committing.' },
    ],
  },
  {
    id: 'import',
    title: 'Importing Items & Customers',
    steps: [
      { heading: 'Download the template', body: 'Go to Admin → Import Items (or Import Customers). Click "Download template CSV" to get a sample file with the correct column headers.' },
      { heading: 'Fill in the CSV', body: 'Open the template in Excel or Google Sheets. Required columns for items: name, costPrice, sellingPrice. Required for customers: name. All other columns are optional.' },
      { heading: 'Item types in the CSV', body: 'The itemType column accepts INVENTORY (default), SERVICE, or NON_INVENTORY. If left blank the item is treated as INVENTORY. Case-insensitive -- "service" and "SERVICE" both work.' },
      { heading: 'Handling commas in names', body: 'If a name contains a comma (e.g. "Mensah, Kwame"), wrap it in double quotes in the CSV. The importer handles quoted fields correctly.' },
      { heading: 'Opening balances for customers', body: 'The balance column is the amount the customer currently owes. Leave blank or enter 0 for new customers with no debt.' },
      { heading: 'Phone format', body: 'Phone numbers can be in any format -- local (0244…), international (+233244…), or with spaces/dashes. The system normalises them automatically.' },
      { heading: 'Preview before importing', body: 'After uploading or pasting CSV text, click "Preview". Review the table -- rows with missing required fields are highlighted in red. Fix the file and re-upload if needed.' },
      { heading: 'Import and review results', body: 'Click the "Import" button. A summary shows how many rows were imported and how many were skipped, with reasons for each skipped row (duplicate name, invalid price, etc.).' },
    ],
  },
  {
    id: 'approvals',
    title: 'Transaction Approvals',
    steps: [
      { heading: 'What triggers an approval', body: 'When the Approvals feature is enabled, a sale pauses for manager sign-off if it includes: a discount, a price override, a credit (pay-later) sale, or other configured overrides.' },
      { heading: 'Cashier view -- PIN modal', body: 'When the CHARGE button is tapped for a sale that needs approval, a PIN prompt appears on the POS screen. The cashier can hand the device to the manager to enter their PIN.' },
      { heading: 'Manager view -- Approvals queue', body: 'The manager can go to Approvals in the sidebar to see all pending transactions. They can approve or reject each one from their own device without touching the cashier\'s screen.' },
      { heading: 'Remote approval flow', body: 'Once the manager approves from the Approvals page, the sale on the cashier\'s POS completes automatically within a few seconds -- no action needed by the cashier.' },
      { heading: 'Rejected sales', body: 'If the manager rejects a transaction, the cashier sees a rejected status. The cart stays open so the cashier can remove the discount or change the payment type and try again.' },
      { heading: 'Enable or disable approvals', body: 'Go to Settings → Features and toggle "Transaction Approvals". Disabling it means all sales complete immediately without a PIN prompt.' },
    ],
  },
  {
    id: 'customers',
    title: 'Managing Customers',
    steps: [
      { heading: 'Add a customer', body: 'Go to Customers → "+ New Customer". Enter name and phone. Phone is recorded for reference and MoMo payments.' },
      { heading: 'Credit sales', body: 'When a sale is recorded as CREDIT, the outstanding amount is added to the customer\'s balance automatically. Their balance is visible on the Customers list.' },
      { heading: 'Record a payment', body: 'Go to Payments → Customer Payments. Search for the customer, enter the amount and payment method, and save. The balance is reduced immediately.' },
      { heading: 'View statement', body: 'Open any customer profile and click "Statement" to see a full history of sales and payments with running balance.' },
      { heading: 'Bulk import customers', body: 'Go to Admin → Import Customers. Upload a CSV with name, phone, and opening balance. See the "Importing Items & Customers" guide for details.' },
      { heading: 'Adjust balance', body: 'Use Admin → Adjust Balances to manually correct a customer\'s balance for write-offs or corrections.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Finance',
    steps: [
      { heading: 'Customer payments', body: 'Go to Payments → Customer Payments. Search for the customer, enter the amount and payment method, then save. The GL is updated automatically.' },
      { heading: 'Supplier payments', body: 'Go to Payments → Supplier Payments. Select the supplier and enter the amount paid against their outstanding invoice.' },
      { heading: 'Expenses', body: 'Go to Expenses → "+ New Expense". Enter the category (e.g. Rent, Utilities), amount, date, and optionally attach a receipt.' },
      { heading: 'Till / Cash register', body: 'Go to Till and click "Open Till" at the start of the day. Enter your float amount. Record cash in/out during the day. Close at end of day to see expected vs actual cash and identify discrepancies.' },
      { heading: 'Payment methods tracked', body: 'The system tracks CASH, MoMo, and Bank payments as separate accounts in the general ledger. End-of-day reports show totals for each method.' },
    ],
  },
  {
    id: 'payroll',
    title: 'Running Payroll',
    steps: [
      { heading: 'Set up employees', body: 'Go to Payroll → Employees and add each employee with their basic salary. Assign a department and job title.' },
      { heading: 'Configure payroll components', body: 'Go to Payroll → Components to create ALLOWANCE (e.g. Transport, Housing) or DEDUCTION (e.g. Loan repayment) components that apply to one or more employees.' },
      { heading: 'Assign components to employees', body: 'Open an employee\'s profile and add the components that apply to them with monthly amounts. These are included automatically in every payroll run.' },
      { heading: 'Set statutory rates', body: 'Go to Payroll → Statutory to confirm SSF (5.5% employee, 13% employer) and PAYE bands are correct. These are calculated automatically on each run.' },
      { heading: 'Run monthly payroll', body: 'Go to Payroll → Payroll Runs → "+ New Run". Select the month and year. The system calculates gross pay, allowances, SSF, PAYE, and loan deductions for every employee. Review line by line.' },
      { heading: 'Confirm and post', body: 'Once reviewed, click Confirm to post the payroll run. Journal entries are created debiting Salary Expense and crediting the appropriate payable accounts. The run is locked after confirmation.' },
      { heading: 'Print payslips', body: 'After confirming, open the payroll run and click "Print Payslips" to generate individual payslip PDFs for each employee.' },
      { heading: 'Employee loans', body: 'Go to an employee\'s profile → Loans tab to record a loan advance. Set the monthly repayment amount -- it is deducted automatically on each payroll run until the loan is settled.' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    steps: [
      { heading: 'Sales report', body: 'Go to Reports → Sales. Filter by date range, staff member, branch, or payment method to drill into performance.' },
      { heading: 'Inventory report', body: 'Go to Reports → Inventory. See current stock levels, low-stock items, and total inventory value across all items.' },
      { heading: 'Debtors report', body: 'Reports → Debtors shows all customers with outstanding balances, sorted by amount owed.' },
      { heading: 'End-of-day report', body: 'Reports → End of Day shows totals for any date: sales count, gross sales, totals by payment method (Cash, MoMo, Bank), and debt repayments collected.' },
      { heading: 'Tax report', body: 'Reports → Tax lists all VAT collected within a date range, ready for filing with GRA.' },
      { heading: 'Audit log', body: 'Admin → Audit Log shows every action in the system: who created, edited, or deleted records and when. Use it to investigate discrepancies.' },
    ],
  },
]

// ── FAQ content ───────────────────────────────────────────────────────────────

interface FAQItem { question: string; answer: string; category: string }

const faqs: FAQItem[] = [
  { category: 'POS', question: 'Why is the barcode scanner not adding items?', answer: 'Make sure the item has a barcode saved in its profile (Items → Edit item → Barcode field). The scanner must send an Enter key after the code -- most USB and Bluetooth scanners do this by default. Confirm you are on the POS page when scanning.' },
  { category: 'POS', question: 'How do I open the customer display on the second screen?', answer: 'Click the 🖥 icon in the POS top bar. A new tab opens at /pos/display. Drag that tab to your second monitor and press F11 for fullscreen. The display syncs automatically as items are scanned.' },
  { category: 'POS', question: 'How does a MoMo payment work at the POS?', answer: 'Select MOMO in the payment panel, enter the customer\'s mobile number, then tap CHARGE. A payment prompt is sent to the customer\'s phone. Once they approve it, the sale completes automatically. If the customer does not approve within 2 minutes, the request times out and you can try again.' },
  { category: 'POS', question: 'What is Split Payment and when should I use it?', answer: 'Split Payment (✂ icon) lets a customer pay part in cash and part via MoMo in a single sale. Tap ✂ SPLIT, enter the MoMo portion, then the cash portion. Both must add up to the total. The MoMo request is sent first; once approved, you collect the cash balance.' },
  { category: 'POS', question: 'A sale needs manager approval -- what do I do?', answer: 'When a sale with a discount, price override, or credit requires approval, the PIN modal appears on the POS screen. The manager can enter the approval PIN here, or open the Approvals page on their own device and approve it remotely. Once approved from either side, the sale completes automatically.' },
  { category: 'POS', question: 'How do I put an order on hold?', answer: 'Click the ⏸ Hold button in the POS top bar. The current cart is saved. Tap the held-orders icon (shows the number of held carts) to recall any of them.' },
  { category: 'POS', question: 'Can I process a credit sale at the POS?', answer: 'Yes, if your settings allow it. Search for and select the customer first (required), then in the payment panel choose CASH and charge less than the total -- the difference is recorded as credit against the customer\'s balance. Credit sales may require manager approval depending on your settings.' },
  { category: 'Sales', question: 'Can I issue a quotation to a customer?', answer: 'Yes. Go to Quotations → "+ New Quotation", add items and the customer. When the customer confirms, open the quotation and click "Convert to Sale" to record it as a completed sale.' },
  { category: 'Sales', question: 'How do I process a return or refund?', answer: 'Go to Returns → "+ New Return". Select the original sale, choose the items being returned, and specify the refund method. Stock is added back automatically for INVENTORY items. SERVICE and NON_INVENTORY items are refunded without a stock adjustment.' },
  { category: 'Sales', question: 'What is a credit sale?', answer: 'A credit sale is when the customer takes goods now and pays later. The unpaid amount is added to their outstanding balance. Record the payment later under Payments → Customer Payments when they settle.' },
  { category: 'Inventory', question: 'What is the difference between INVENTORY, SERVICE, and NON_INVENTORY?', answer: 'INVENTORY items track stock -- quantity goes up on purchase and down on sale. SERVICE items are non-physical (e.g. consultation fees) and appear on invoices but never affect stock. NON_INVENTORY items are physical goods you sell without tracking stock (e.g. packaging, one-off items).' },
  { category: 'Inventory', question: 'My stock count is wrong -- how do I fix it?', answer: 'Go to Admin → Adjust Stock. Select the item, enter the correct quantity, and choose a reason. The adjustment is logged in the audit trail with the old and new quantities.' },
  { category: 'Inventory', question: 'How do I transfer stock between branches?', answer: 'Go to Transfers → "+ New Transfer". Select source branch, destination branch, item, and quantity. Stock is deducted from the source and added to the destination when the transfer is confirmed.' },
  { category: 'Inventory', question: 'Can I import items in bulk?', answer: 'Yes. Go to Admin → Import Items. Download the CSV template, fill in your items (name, costPrice, sellingPrice are required; itemType, barcode, quantity, reorderLevel are optional), upload, preview, then import. Duplicate names are skipped with an error message.' },
  { category: 'Import', question: 'My CSV import shows "Missing required columns" -- what does that mean?', answer: 'The header row must contain exactly: name, costPrice, sellingPrice (for items) or name (for customers). Column names are case-insensitive (costprice and costPrice both work), but spelling must be exact. Download the template from the import page to get the correct headers.' },
  { category: 'Import', question: 'Some rows were skipped during import -- why?', answer: 'Common reasons: the item or customer name already exists (duplicates are skipped), a required field is empty, a price is not a valid number, or a barcode is already in use by another item. The results banner lists the exact reason for each skipped row.' },
  { category: 'Import', question: 'Can I import customers with a negative balance?', answer: 'No. The balance column represents the amount the customer owes (a debt). Negative values are not accepted. Leave blank or use 0 for customers with no opening balance.' },
  { category: 'Finance', question: 'How do I record a payment from a customer?', answer: 'Go to Payments → Customer Payments → "+ New Payment". Search for the customer, enter the amount, choose the payment method (Cash, MoMo, or Bank), and save. The customer\'s balance is reduced immediately.' },
  { category: 'Finance', question: 'What is the Till / Cash Drawer?', answer: 'The Till tracks physical cash at the register. Open it at the start of your shift with a float amount. Record cash in/out during the day. Close at end of day to see expected vs actual cash and identify discrepancies.' },
  { category: 'Finance', question: 'How do I record business expenses?', answer: 'Go to Expenses → "+ New Expense". Enter the category, amount, and date. Expenses are posted to the general ledger and reduce your net income in profit & loss reports.' },
  { category: 'Finance', question: 'Does the system track Cash, MoMo, and Bank payments separately?', answer: 'Yes. Every payment -- whether from a sale, customer payment, or supplier payment -- is posted to a separate GL account: Cash (1010), Bank (1020), or Mobile Money (1030). The End-of-Day report shows totals for each method.' },
  { category: 'Settings', question: 'How do I add a new staff member?', answer: 'Go to Admin → Users → "+ Invite User". Enter their name, email, and role. They receive an invitation email. Roles control which pages and actions they can access.' },
  { category: 'Settings', question: 'What is the difference between roles?', answer: 'Owner has full access. Store Manager can manage most things but not billing. Branch Manager manages one location. Cashier can only use the POS and record sales. Inventory Manager handles stock. Accountant accesses finance and payroll. Staff has limited view-only access.' },
  { category: 'Settings', question: 'How do I set up taxes (VAT)?', answer: 'Go to Settings → Taxes. Create a tax rate (e.g. VAT at 15%). Assign it to items in the item\'s detail page. Tax is calculated automatically on sales and shown separately on receipts and invoices.' },
  { category: 'Settings', question: 'How do I enable approval for discounts and credit sales?', answer: 'Go to Settings → Features and turn on "Transaction Approvals". Once enabled, any sale with a discount, price override, or credit will pause for PIN or manager approval before completing.' },
  { category: 'Payroll', question: 'How do I run monthly payroll?', answer: 'Go to Payroll → Payroll Runs → "+ New Run". Select the month and year. The system calculates gross pay, allowances, SSF (employee + employer), PAYE, and other deductions for each employee. Review line by line, then confirm to lock and post the run.' },
  { category: 'Payroll', question: 'How do I set up employee allowances?', answer: 'Go to Payroll → Components and create an ALLOWANCE component (e.g. Transport Allowance). Then open an employee\'s profile and assign the component with a monthly amount. It will be included automatically in every payroll run.' },
  { category: 'Payroll', question: 'What are statutory deductions?', answer: 'SSF Employee (5.5% of basic salary) and PAYE (income tax per GRA bands) are statutory. Configure rates at Payroll → Statutory. PAYE is calculated automatically based on each employee\'s chargeable income (basic + allowances − SSF).' },
  { category: 'Payroll', question: 'How do I record and recover an employee loan?', answer: 'Open the employee\'s profile and go to the Loans tab. Enter the loan amount and set a monthly repayment figure. The repayment is deducted automatically on each payroll run until the loan balance reaches zero.' },
]

const CATEGORIES = ['All', ...Array.from(new Set(faqs.map(f => f.category)))]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null)
  const [faqSearch, setFaqSearch] = useState('')
  const [faqCategory, setFaqCategory] = useState('All')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const filteredFaqs = faqs.filter(f => {
    const matchCat = faqCategory === 'All' || f.category === faqCategory
    const q = faqSearch.trim().toLowerCase()
    return matchCat && (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
  })

  const tutorial = tutorials.find(t => t.id === activeTutorial)
  const tutorialIdx = tutorials.findIndex(t => t.id === activeTutorial)

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-10 py-2">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Help &amp; Support</h1>
          <p className="text-sm text-gray-500 mt-1">Step-by-step guides and answers to common questions.</p>
        </div>

        {/* ── Tutorials ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Guides</h2>

          {!activeTutorial ? (
            <div className="border-2 border-gray-200 divide-y divide-gray-200">
              {tutorials.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTutorial(t.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-sm font-semibold text-gray-800">{t.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 group-hover:text-gray-600 transition-colors" />
                </button>
              ))}
            </div>
          ) : tutorial ? (
            <div className="border-2 border-gray-200">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gray-200 bg-gray-50">
                <h3 className="text-sm font-bold text-gray-900">{tutorial.title}</h3>
                <button
                  onClick={() => setActiveTutorial(null)}
                  className="text-xs text-gray-500 hover:text-gray-800 font-semibold"
                >
                  ← Back to guides
                </button>
              </div>

              {/* Steps */}
              <ol className="px-4 py-4 space-y-4">
                {tutorial.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 shrink-0 bg-gray-800 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{step.heading}</p>
                      <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Prev / next */}
              <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-200 bg-gray-50">
                <button
                  onClick={() => tutorialIdx > 0 && setActiveTutorial(tutorials[tutorialIdx - 1].id)}
                  disabled={tutorialIdx === 0}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-30 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">{tutorialIdx + 1} / {tutorials.length}</span>
                <button
                  onClick={() => {
                    if (tutorialIdx < tutorials.length - 1) setActiveTutorial(tutorials[tutorialIdx + 1].id)
                    else setActiveTutorial(null)
                  }}
                  className="text-xs font-semibold text-gray-800 hover:text-gray-900 transition-colors"
                >
                  {tutorialIdx < tutorials.length - 1 ? 'Next →' : 'Done'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Frequently Asked Questions</h2>

          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={faqSearch}
                onChange={e => { setFaqSearch(e.target.value); setOpenFaq(null) }}
                placeholder="Search questions…"
                className="w-full pl-9 pr-4 py-2 border-2 border-gray-200 focus:border-gray-400 focus:outline-none text-sm"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setFaqCategory(cat); setOpenFaq(null) }}
                  className={`px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                    faqCategory === cat
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="border-2 border-gray-200 p-8 text-center text-sm text-gray-400">
              No results for &quot;{faqSearch}&quot;.
            </div>
          ) : (
            <div className="border-2 border-gray-200 divide-y divide-gray-200">
              {filteredFaqs.map((faq, idx) => (
                <div key={idx}>
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 border border-gray-300 text-gray-500 shrink-0 mt-0.5 whitespace-nowrap">
                      {faq.category}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-900">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform duration-150 ${openFaq === idx ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openFaq === idx && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-200 bg-gray-50">
                      <p className="text-sm text-gray-700 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Contact */}
        <section className="border-t-2 border-gray-200 pt-6">
          <p className="text-sm font-semibold text-gray-900 mb-1">Still need help?</p>
          <p className="text-sm text-gray-600 mb-3">
            Contact your system administrator or reach out to the developer directly. When reporting an issue, include a description of what you were doing and any error messages you saw.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="tel:0246462398"
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 hover:border-gray-400 transition-colors text-sm font-semibold text-gray-800"
            >
              <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              0246 462 398
            </a>
            <a
              href="mailto:support@eyosolutions.com"
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 hover:border-gray-400 transition-colors text-sm font-semibold text-gray-800"
            >
              <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              support@eyosolutions.com
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">System Developed by EYO Solutions | 0246 462 398</p>
        </section>

      </div>
    </AppLayout>
  )
}
