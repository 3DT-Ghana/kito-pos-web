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
      { heading: 'Open the POS', body: 'Click "POS Terminal" in the sidebar. Choose your branch if prompted.' },
      { heading: 'Add items to the cart', body: 'Tap any item tile to add it, or scan the barcode — the item is added instantly. Scanning the same barcode again increases the quantity by 1.' },
      { heading: 'Adjust quantity', body: 'Tap the quantity number on a cart line, then type the exact amount on the numpad.' },
      { heading: 'Apply a discount', body: 'Tap "Discount" on a cart line. Use % for percentage off or GHS for a fixed amount. An order-level discount can be applied above the TOTAL.' },
      { heading: 'Select a customer (optional)', body: 'Use the customer search at the top of the cart. Required for credit sales; optional for cash.' },
      { heading: 'Choose payment method', body: 'Tap CASH, MOMO, or BANK. For cash, enter the amount tendered so the change is calculated.' },
      { heading: 'Complete the sale', body: 'Tap the green CHARGE button. If the sale requires manager approval (discount, credit, override), a PIN prompt appears. The manager can enter the PIN here or approve it on the Approvals page on their own device.' },
      { heading: 'Customer display', body: 'Click the 🖥 icon in the top bar to open the customer-facing screen on the second monitor. It syncs automatically as items are scanned.' },
    ],
  },
  {
    id: 'sales',
    title: 'Recording a Manual Sale',
    steps: [
      { heading: 'Go to Sales → New Sale', body: 'Click "Sales" in the sidebar, then the "+ New Sale" button.' },
      { heading: 'Search and add items', body: 'Type an item name in the search box and click it to add. Adjust quantity and price inline.' },
      { heading: 'Choose payment type', body: 'Select CASH for immediate payment, or CREDIT if the customer will pay later. CREDIT requires a customer to be linked.' },
      { heading: 'Select payment method', body: 'Pick CASH, MoMo, or Bank transfer.' },
      { heading: 'Save the sale', body: 'Click "Record Sale". Stock is reduced and a receipt is generated.' },
    ],
  },
  {
    id: 'inventory',
    title: 'Managing Inventory',
    steps: [
      { heading: 'Add a new item', body: 'Go to Items → click "+ New Item". Fill in name, selling price, and cost price. Set type to INVENTORY to track stock, or SERVICE for non-physical items.' },
      { heading: 'Set stock levels', body: 'Enter the opening stock quantity when creating the item. After that, use Purchases to add stock when goods arrive.' },
      { heading: 'Adjust stock', body: 'For corrections (e.g. after a stock count), go to Admin → Adjust Stock. Select the item and enter the new quantity with a reason.' },
      { heading: 'Categories', body: 'Go to Categories to create groups (e.g. "Beverages", "Electronics"). Assign items to categories to make POS browsing faster.' },
      { heading: 'Low stock alerts', body: 'Items with 5 or fewer units show a warning on the POS and Items list. Use Reports → Inventory for a full low-stock report.' },
      { heading: 'Barcodes', body: "Set a barcode on an item's detail page. Go to Barcode Labels to print sticker sheets." },
    ],
  },
  {
    id: 'customers',
    title: 'Managing Customers',
    steps: [
      { heading: 'Add a customer', body: 'Go to Customers → "+ New Customer". Enter name and phone. Phone is used for SMS notifications if enabled.' },
      { heading: 'Credit sales', body: "When a sale is recorded as CREDIT, the outstanding amount is added to the customer's balance automatically." },
      { heading: 'Record a payment', body: "Go to Payments → Customer Payments. Select the customer and enter the amount paid to reduce their balance." },
      { heading: 'View statement', body: 'Open any customer profile and click "Statement" to see a full history of sales and payments.' },
      { heading: 'Adjust balance', body: "Use Admin → Adjust Balances to manually correct a customer's balance for write-offs or opening balances." },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Finance',
    steps: [
      { heading: 'Customer payments', body: 'Go to Payments → Customer Payments. Search for the customer, enter the amount and payment method, then save.' },
      { heading: 'Supplier payments', body: 'Go to Payments → Supplier Payments. Select the supplier and enter the amount paid against their invoice.' },
      { heading: 'Expenses', body: 'Go to Expenses → "+ New Expense". Enter the category (e.g. Rent, Utilities), amount, and date.' },
      { heading: 'Till / Cash register', body: 'Go to Till and click "Open Till" at the start of the day. Enter the float. Close the till at end of day to see the cash summary.' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    steps: [
      { heading: 'Sales report', body: 'Go to Reports → Sales. Filter by date range, staff member, or payment method.' },
      { heading: 'Inventory report', body: 'Go to Reports → Inventory. See stock levels, low-stock items, and total inventory value.' },
      { heading: 'Debtors report', body: 'Reports → Debtors shows all customers with outstanding balances.' },
      { heading: 'End-of-day report', body: 'Reports → End of Day shows totals for any date: sales count, totals by payment method, and cash vs non-cash.' },
      { heading: 'Tax report', body: 'Reports → Tax lists all VAT collected, ready for filing with GRA.' },
      { heading: 'Audit log', body: 'Admin → Audit Log shows every action: who created, edited, or deleted records and when.' },
    ],
  },
]

// ── FAQ content ───────────────────────────────────────────────────────────────

interface FAQItem { question: string; answer: string; category: string }

const faqs: FAQItem[] = [
  { category: 'POS', question: 'Why is the barcode scanner not adding items?', answer: 'Make sure the item has a barcode saved in its profile (Items → Edit item → Barcode field). The scanner must send an Enter key after the code — most USB and Bluetooth scanners do this by default. Confirm you are on the /pos page when scanning.' },
  { category: 'POS', question: 'How do I open the customer display on the second screen?', answer: 'Click the 🖥 icon in the POS top bar. A new tab opens at /pos/display. Drag that tab to your second monitor and press F11 for fullscreen. The display syncs automatically.' },
  { category: 'POS', question: 'A sale needs manager approval — what do I do?', answer: 'When a sale with a discount, price override, or credit requires approval, the PIN modal appears. The manager can enter the approval PIN on your screen, or open the Approvals page on their own device and approve it there. Once approved from either side, the sale completes automatically.' },
  { category: 'POS', question: 'How do I put an order on hold?', answer: 'Click the ⏸ Hold button in the POS top bar. The current cart is saved. Tap the held orders icon to recall it later.' },
  { category: 'Sales', question: 'Can I issue a quotation to a customer?', answer: 'Yes. Go to Quotations → "+ New Quotation", add items and the customer. When the customer confirms, open the quotation and convert it to a sale.' },
  { category: 'Sales', question: 'How do I process a return or refund?', answer: 'Go to Returns → "+ New Return". Select the original sale, choose the items being returned, and specify the refund method. Stock is added back automatically for inventory items.' },
  { category: 'Sales', question: 'What is a credit sale?', answer: "A credit sale is when the customer takes goods now and pays later. The unpaid amount is added to their balance. Record a payment later under Payments → Customer Payments when they settle." },
  { category: 'Inventory', question: 'My stock count is wrong — how do I fix it?', answer: 'Go to Admin → Adjust Stock. Select the item, enter the correct quantity, and choose a reason. This creates an audit log entry.' },
  { category: 'Inventory', question: 'How do I transfer stock between branches?', answer: 'Go to Transfers → "+ New Transfer". Select source branch, destination branch, item, and quantity. Stock is deducted from source and added to destination when confirmed.' },
  { category: 'Inventory', question: 'Can I import items in bulk?', answer: 'Yes. Go to Admin → Import Items. Download the CSV template, fill in your items, and upload the file. The system previews the data before importing.' },
  { category: 'Finance', question: 'How do I record a payment from a customer?', answer: 'Go to Payments → Customer Payments → "+ New Payment". Search for the customer, enter the amount, choose the payment method, and save.' },
  { category: 'Finance', question: 'What is the Till / Cash Drawer?', answer: 'The Till tracks cash at the physical register. Open it at the start of your shift with a float amount, record cash in/out, and close at end of day to see expected vs actual cash.' },
  { category: 'Finance', question: 'How do I record business expenses?', answer: 'Go to Expenses → "+ New Expense". Enter the category, amount, and date. Expenses reduce your net income in profit & loss reports.' },
  { category: 'Settings', question: 'How do I add a new staff member?', answer: 'Go to Admin → Users → "+ Invite User". Enter their name, email, and role. They receive a login email. Roles control which pages and actions they can access.' },
  { category: 'Settings', question: 'What is the difference between roles?', answer: 'Owner has full access. Store Manager can manage most things but not billing. Branch Manager manages one location. Cashier can only use the POS and record sales. Inventory Manager handles stock. Accountant accesses finance and payroll. Staff has limited access.' },
  { category: 'Settings', question: 'How do I set up taxes (VAT)?', answer: "Go to Settings → Taxes. Create a tax rate (e.g. VAT at 15%). Assign it to items in the item's detail page. Tax is calculated automatically on sales and shown on receipts." },
  { category: 'Settings', question: 'How do I enable approval for discounts?', answer: 'Go to Settings → Features and turn on "Transaction Approvals". Once enabled, any sale with a discount, price override, or credit will pause for PIN or manager approval before completing.' },
  { category: 'Payroll', question: 'How do I run monthly payroll?', answer: 'Go to Payroll → Payroll Runs → "+ New Run". Select the month and year. The system calculates gross pay, SSF, PAYE, and deductions for each employee. Review, then confirm to post the run.' },
  { category: 'Payroll', question: 'How do I set up employee allowances?', answer: "Go to Payroll → Components and create an ALLOWANCE (e.g. Transport). Then go to an employee's profile and assign it with a monthly amount. It will be included in every payroll run." },
  { category: 'Payroll', question: 'What are statutory deductions?', answer: 'SSF Employee (5.5% of basic salary) and PAYE (income tax per GRA bands). Configure rates at Payroll → Statutory. PAYE is calculated automatically based on chargeable income.' },
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
          <p className="text-sm text-gray-600">
            Contact your system administrator or reach the PETROS support team at{' '}
            <a href="mailto:support@petros.app" className="font-semibold text-gray-900 hover:underline">
              support@petros.app
            </a>
            . Include a description of what you were doing and any error messages you saw.
          </p>
        </section>

      </div>
    </AppLayout>
  )
}
