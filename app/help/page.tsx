'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Monitor, ShoppingCart, Package, Users, CreditCard, BarChart2,
  ChevronDown, Search, BookOpen, HelpCircle, ArrowRight,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tutorial {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  steps: { heading: string; body: string }[]
}

interface FAQItem {
  question: string
  answer: string
  category: string
}

// ── Tutorial content ───────────────────────────────────────────────────────────

const tutorials: Tutorial[] = [
  {
    id: 'pos',
    title: 'Using the POS Terminal',
    description: 'Scan items, apply discounts, and complete a sale.',
    icon: <Monitor className="w-5 h-5" />,
    color: 'bg-indigo-100 text-indigo-700',
    steps: [
      { heading: 'Open the POS', body: 'Click "POS Terminal" in the sidebar. Choose your branch if prompted.' },
      { heading: 'Add items to the cart', body: 'Tap any item tile to add it to the cart, or scan the barcode with a scanner — the item is added instantly. Scan the same item again to increase the quantity.' },
      { heading: 'Adjust quantity', body: 'Tap the qty number on a cart line to open the numpad and type the exact quantity you want.' },
      { heading: 'Apply a discount', body: 'Tap "Add discount" on any cart line. Use the % toggle for percentage off, or GHS for a fixed amount. An order-level discount sits above the TOTAL at the bottom.' },
      { heading: 'Select a customer (optional)', body: 'Use the customer search box at the top of the cart panel. This is required for credit sales but optional for cash.' },
      { heading: 'Choose payment method', body: 'Tap CASH, MOMO, or BANK. For cash, tap the "Cash Tendered" box and enter the amount the customer pays.' },
      { heading: 'Complete the sale', body: 'Tap the green CHARGE button. For discounted or credit sales that require approval, a PIN prompt appears — the manager enters their PIN, or approves from the Approvals page on their device.' },
      { heading: 'Customer display', body: 'Click the 🖥 icon in the top bar to open the customer-facing screen on the second monitor. It updates automatically as items are scanned.' },
    ],
  },
  {
    id: 'sales',
    title: 'Recording a Manual Sale',
    description: 'Create a sale from the Sales section without the POS.',
    icon: <ShoppingCart className="w-5 h-5" />,
    color: 'bg-green-100 text-green-700',
    steps: [
      { heading: 'Go to Sales → New Sale', body: 'Click "Sales" in the sidebar, then the "+ New Sale" button in the top-right corner.' },
      { heading: 'Search and add items', body: 'Type an item name in the search box and click it to add. Adjust quantity and price inline in the cart.' },
      { heading: 'Choose payment type', body: 'Select CASH for immediate payment, or CREDIT if the customer will pay later. CREDIT requires a customer to be selected.' },
      { heading: 'Select payment method', body: 'Pick CASH, MoMo, or Bank transfer.' },
      { heading: 'Save the sale', body: 'Click "Record Sale". Stock is reduced and a receipt is generated immediately.' },
    ],
  },
  {
    id: 'inventory',
    title: 'Managing Inventory',
    description: 'Add items, adjust stock, and set up categories.',
    icon: <Package className="w-5 h-5" />,
    color: 'bg-amber-100 text-amber-700',
    steps: [
      { heading: 'Add a new item', body: 'Go to Items → click "+ New Item". Fill in name, selling price, and cost price. Set item type to INVENTORY to track stock levels, or SERVICE for non-physical items.' },
      { heading: 'Set stock levels', body: 'Enter the opening stock quantity when creating the item. After that, use Purchases to add stock when goods arrive.' },
      { heading: 'Adjust stock', body: 'For corrections (e.g. after a stock count), go to Admin → Adjust Stock. Select the item and enter the new quantity with a reason.' },
      { heading: 'Categories', body: 'Go to Categories to create groups (e.g. "Beverages", "Electronics"). Assign items to categories to make POS browsing faster.' },
      { heading: 'Low stock alerts', body: 'Items with 5 or fewer units show a yellow warning on the POS and in the Items list. Use Reports → Inventory for a full low-stock report.' },
      { heading: 'Barcodes', body: 'Set a barcode on an item\'s detail page. Go to Barcode Labels to print sticker sheets for your products.' },
    ],
  },
  {
    id: 'customers',
    title: 'Managing Customers',
    description: 'Add customers, track credit balances, and send statements.',
    icon: <Users className="w-5 h-5" />,
    color: 'bg-blue-100 text-blue-700',
    steps: [
      { heading: 'Add a customer', body: 'Go to Customers → "+ New Customer". Enter name and phone number. Phone number is used for SMS notifications if enabled.' },
      { heading: 'Credit sales', body: 'When a sale is recorded as CREDIT, the outstanding amount is added to the customer\'s balance automatically.' },
      { heading: 'Record a payment', body: 'Go to Payments → Customer Payments. Select the customer and enter the amount paid to reduce their balance.' },
      { heading: 'View statement', body: 'Open any customer profile and click "Statement" to see a full history of sales and payments.' },
      { heading: 'Adjust balance', body: 'Use Admin → Adjust Balances to manually correct a customer\'s balance — for write-offs or opening balances.' },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Finance',
    description: 'Record payments, manage expenses, and open the till.',
    icon: <CreditCard className="w-5 h-5" />,
    color: 'bg-rose-100 text-rose-700',
    steps: [
      { heading: 'Customer payments', body: 'Go to Payments → Customer Payments. Search for the customer, enter the amount and payment method, then save.' },
      { heading: 'Supplier payments', body: 'Go to Payments → Supplier Payments. Select the supplier and enter the amount paid against their invoice.' },
      { heading: 'Expenses', body: 'Go to Expenses → "+ New Expense". Enter the category (e.g. Rent, Utilities), amount, and date. This reduces your profit in reports.' },
      { heading: 'Till / Cash register', body: 'Go to Till and click "Open Till" at the start of the day. Enter the float amount. Throughout the day, cash in/out is tracked. Close the till at end of day to see the cash summary.' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    description: 'Understand your sales, stock, and financial performance.',
    icon: <BarChart2 className="w-5 h-5" />,
    color: 'bg-purple-100 text-purple-700',
    steps: [
      { heading: 'Sales report', body: 'Go to Reports → Sales. Filter by date range, staff member, or payment method. See totals, items sold, and daily breakdowns.' },
      { heading: 'Inventory report', body: 'Go to Reports → Inventory. See current stock levels, low-stock items, and the total value of goods on hand.' },
      { heading: 'Debtors report', body: 'Reports → Debtors shows all customers with outstanding balances, sorted by amount owed.' },
      { heading: 'End-of-day report', body: 'Reports → End of Day shows the full summary for any date: sales count, totals by payment method, and cash vs non-cash breakdown.' },
      { heading: 'Tax report', body: 'Reports → Tax lists all VAT and tax collected, ready for filing with GRA.' },
      { heading: 'Audit log', body: 'Admin → Audit Log shows every action taken in the system — who created, edited, or deleted records and when.' },
    ],
  },
]

// ── FAQ content ───────────────────────────────────────────────────────────────

const faqs: FAQItem[] = [
  // POS
  { category: 'POS', question: 'Why is the barcode scanner not adding items?', answer: 'Make sure the item has a barcode saved in its profile (Items → Edit item → Barcode field). The scanner must emit an Enter key after the code — most USB and Bluetooth scanners do this by default. Also confirm you are on the /pos page when scanning.' },
  { category: 'POS', question: 'How do I open the customer display on the second screen?', answer: 'Click the 🖥 icon in the POS top bar. A new browser tab opens at /pos/display. Drag that tab to your second monitor and press F11 for fullscreen. The display will sync automatically.' },
  { category: 'POS', question: 'A sale needs manager approval — what do I do?', answer: 'When a sale with a discount, price override, or credit requires approval, the PIN modal appears. The manager can either type their approval PIN on your screen, or open the Approvals page on their own device and approve it there. Once approved from either side, the sale completes automatically.' },
  { category: 'POS', question: 'How do I put an order on hold?', answer: 'Click the ⏸ Hold button in the POS top bar. The current cart is saved. Tap the held orders icon (list icon) to recall it later. Useful when a customer needs to check something before paying.' },
  // Sales
  { category: 'Sales', question: 'Can I issue a quotation to a customer?', answer: 'Yes. Go to Quotations → "+ New Quotation", add items and the customer, then send or print it. When the customer confirms, open the quotation and convert it to a sale with one click.' },
  { category: 'Sales', question: 'How do I process a return or refund?', answer: 'Go to Returns → "+ New Return". Select the original sale, choose the items being returned, and specify the refund method. Stock is added back automatically for inventory items.' },
  { category: 'Sales', question: 'What is a credit sale?', answer: 'A credit sale is when the customer takes the goods now and pays later. The unpaid amount is added to their balance. Record a payment later under Payments → Customer Payments when they settle.' },
  // Inventory
  { category: 'Inventory', question: 'My stock count is wrong — how do I fix it?', answer: 'Go to Admin → Adjust Stock. Select the item, enter the correct quantity, choose a reason (e.g. "Stock count correction"), and save. This creates an audit log entry for the change.' },
  { category: 'Inventory', question: 'How do I transfer stock between branches?', answer: 'Go to Transfers → "+ New Transfer". Select the source branch, destination branch, item, and quantity. The stock is deducted from the source and added to the destination when the transfer is confirmed.' },
  { category: 'Inventory', question: 'Can I import items in bulk?', answer: 'Yes. Go to Admin → Import Items. Download the CSV template, fill in your items, and upload the file. The system will preview the data before importing.' },
  // Finance
  { category: 'Finance', question: 'How do I record a payment from a customer?', answer: 'Go to Payments → Customer Payments → "+ New Payment". Search for the customer, enter the amount, choose the payment method, and save. Their balance reduces immediately.' },
  { category: 'Finance', question: 'What is the Till / Cash Drawer?', answer: 'The Till tracks cash at the physical register. Open it at the start of your shift with a float amount, record cash in/out during the day, and close it at the end to see your expected vs actual cash.' },
  { category: 'Finance', question: 'How do I record business expenses?', answer: 'Go to Expenses → "+ New Expense". Enter the category, amount, and date. Expenses are included in profit & loss reports and reduce your net income.' },
  // Users & Settings
  { category: 'Settings', question: 'How do I add a new staff member?', answer: 'Go to Admin → Users → "+ Invite User". Enter their name, email, and select a role. They will receive a login email. Roles control what pages and actions they can access.' },
  { category: 'Settings', question: 'What is the difference between roles?', answer: 'Owner has full access. Store Manager can manage most things but not billing. Branch Manager manages one location. Cashier can only use the POS and record sales. Inventory Manager handles stock. Accountant accesses finance and payroll. Staff has limited access.' },
  { category: 'Settings', question: 'How do I set up taxes (VAT)?', answer: 'Go to Settings → Taxes. Create a tax rate (e.g. "VAT" at 15%). Assign it to items in the item\'s detail page. Tax is then calculated automatically on sales and shown on receipts.' },
  { category: 'Settings', question: 'How do I enable approval for discounts?', answer: 'Go to Settings → Features and turn on "Require Manager Approval". Once enabled, any sale with a discount, price override, or credit will pause for PIN or manager approval before completing.' },
  // Payroll
  { category: 'Payroll', question: 'How do I run monthly payroll?', answer: 'Go to Payroll → Payroll Runs → "+ New Run". Select the month and year. The system calculates gross pay, SSF, PAYE, and deductions for each employee automatically. Review the results, then confirm to post the run.' },
  { category: 'Payroll', question: 'How do I set up employee allowances?', answer: 'Go to Payroll → Components and create an ALLOWANCE (e.g. Transport). Then go to an employee\'s profile and assign the component with its monthly amount. It will be included in every payroll run.' },
  { category: 'Payroll', question: 'What are statutory deductions?', answer: 'Statutory deductions are government-mandated deductions: SSF Employee (5.5% of basic salary) and PAYE (income tax per GRA bands). Configure the rates at Payroll → Statutory. PAYE is calculated automatically based on chargeable income.' },
]

// ── Page component ────────────────────────────────────────────────────────────

const CATEGORIES = ['All', ...Array.from(new Set(faqs.map(f => f.category)))]

export default function HelpPage() {
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null)
  const [faqSearch, setFaqSearch] = useState('')
  const [faqCategory, setFaqCategory] = useState('All')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const filteredFaqs = faqs.filter(f => {
    const matchCat = faqCategory === 'All' || f.category === faqCategory
    const q = faqSearch.trim().toLowerCase()
    const matchSearch = !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const tutorial = tutorials.find(t => t.id === activeTutorial)

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-10 py-2">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-indigo-100 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Help &amp; Support</h1>
          </div>
          <p className="text-sm text-gray-500 ml-13">Step-by-step guides and answers to common questions.</p>
        </div>

        {/* ── Tutorials ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-gray-500" />
            <h2 className="text-lg font-bold text-gray-800">Tutorials</h2>
          </div>

          {!activeTutorial ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tutorials.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTutorial(t.id)}
                  className="text-left bg-white border-2 border-gray-100 hover:border-indigo-300 hover:shadow-sm p-4 transition-all group"
                >
                  <div className={`w-9 h-9 flex items-center justify-center mb-3 ${t.color}`}>
                    {t.icon}
                  </div>
                  <p className="font-bold text-gray-900 text-sm mb-1">{t.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{t.description}</p>
                  <div className="flex items-center gap-1 mt-3 text-indigo-600 text-xs font-semibold">
                    View guide <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          ) : tutorial ? (
            <div className="bg-white border-2 border-gray-100">
              {/* Tutorial header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className={`w-9 h-9 flex items-center justify-center ${tutorial.color}`}>
                  {tutorial.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{tutorial.title}</h3>
                  <p className="text-xs text-gray-500">{tutorial.description}</p>
                </div>
                <button
                  onClick={() => setActiveTutorial(null)}
                  className="text-sm text-gray-400 hover:text-gray-600 font-semibold px-3 py-1 hover:bg-gray-100 transition-colors"
                >
                  ← All guides
                </button>
              </div>

              {/* Steps */}
              <ol className="px-5 py-5 space-y-5">
                {tutorial.steps.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <div className="w-7 h-7 shrink-0 bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm mb-0.5">{step.heading}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Bottom nav */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => {
                    const idx = tutorials.findIndex(t => t.id === activeTutorial)
                    if (idx > 0) setActiveTutorial(tutorials[idx - 1].id)
                  }}
                  disabled={tutorials.findIndex(t => t.id === activeTutorial) === 0}
                  className="text-sm font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-30 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">
                  {tutorials.findIndex(t => t.id === activeTutorial) + 1} / {tutorials.length}
                </span>
                <button
                  onClick={() => {
                    const idx = tutorials.findIndex(t => t.id === activeTutorial)
                    if (idx < tutorials.length - 1) setActiveTutorial(tutorials[idx + 1].id)
                    else setActiveTutorial(null)
                  }}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {tutorials.findIndex(t => t.id === activeTutorial) < tutorials.length - 1 ? 'Next →' : 'Done ✓'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── FAQ ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-4 h-4 text-gray-500" />
            <h2 className="text-lg font-bold text-gray-800">Frequently Asked Questions</h2>
          </div>

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={faqSearch}
                onChange={e => { setFaqSearch(e.target.value); setOpenFaq(null) }}
                placeholder="Search questions…"
                className="w-full pl-9 pr-4 py-2 border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-sm"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setFaqCategory(cat); setOpenFaq(null) }}
                  className={`px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
                    faqCategory === cat
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* FAQ accordion */}
          {filteredFaqs.length === 0 ? (
            <div className="bg-white border-2 border-gray-100 p-10 text-center text-gray-400 text-sm">
              No questions match your search.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFaqs.map((faq, idx) => (
                <div key={idx} className="bg-white border-2 border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`text-[10px] font-bold px-2 py-0.5 shrink-0 ${
                      faq.category === 'POS' ? 'bg-indigo-100 text-indigo-700' :
                      faq.category === 'Sales' ? 'bg-green-100 text-green-700' :
                      faq.category === 'Inventory' ? 'bg-amber-100 text-amber-700' :
                      faq.category === 'Finance' ? 'bg-rose-100 text-rose-700' :
                      faq.category === 'Settings' ? 'bg-gray-100 text-gray-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {faq.category}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-900">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150 ${openFaq === idx ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openFaq === idx && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                      <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Contact / support note */}
        <section className="bg-indigo-50 border-2 border-indigo-100 px-5 py-4 flex items-start gap-4">
          <div className="w-9 h-9 bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
            <HelpCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm mb-1">Still need help?</p>
            <p className="text-sm text-gray-600">
              Contact your system administrator or reach out to PETROS support at{' '}
              <a href="mailto:support@petros.app" className="text-indigo-600 font-semibold hover:underline">
                support@petros.app
              </a>
              . Include a description of what you were doing and any error messages you saw.
            </p>
          </div>
        </section>

      </div>
    </AppLayout>
  )
}
