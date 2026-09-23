export type Language = "en" | "my"; // en = English, my = Myanmar (Burmese)

export interface Translations {
  // TopNavBar
  mainCurrency: string;
  noBranch: string;
  mainBranch: string;
  logout: string;

  // Sidebar Menu
  home: string;
  dashboard: string;
  sales: string;
  transactions: string;
  reports: string;
  payments: string;
  inventory: string;
  stocks: string;
  customers: string;
  expenses: string;
  barcode: string;
  labelPrint: string;
  printSettings: string;
  shopsBranches: string;
  manageShops: string;
  shopReports: string;
  staff: string;
  settings: string;

  // Common words
  search: string;
  filter: string;
  add: string;
  edit: string;
  delete: string;
  save: string;
  cancel: string;
  confirm: string;
  close: string;
  next: string;
  previous: string;
  submit: string;
  reset: string;
  clear: string;
  apply: string;
  view: string;
  details: string;
  actions: string;
  status: string;
  date: string;
  time: string;
  total: string;
  subtotal: string;
  discount: string;
  tax: string;
  required: string;
  optional: string;
  yes: string;
  no: string;
  all: string;
  none: string;
  loading: string;
  noData: string;
  noResults: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  selectAll: string;
  deselectAll: string;
  showing: string;
  of: string;
  entries: string;
  perPage: string;
  showing_entries: string;

  // Stock/Inventory
  productName: string;
  category: string;
  brand: string;
  color: string;
  size: string;
  quantity: string;
  price: string;
  originalPrice: string;
  original: string;
  sellingPrice: string;
  wholesalePrice: string;
  retailPrice: string;
  costPrice: string;
  profit: string;
  profitMargin: string;
  inStock: string;
  outOfStock: string;
  lowStock: string;
  addStock: string;
  editStock: string;
  deleteStock: string;
  stockDetails: string;
  variants: string;
  addVariant: string;
  images: string;
  uploadImage: string;
  description: string;
  sku: string;
  barcode_label: string;

  // Customer
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  addCustomer: string;
  editCustomer: string;
  deleteCustomer: string;
  customerDetails: string;
  totalPurchases: string;
  lastPurchase: string;

  // Transaction
  transactionId: string;
  transactionDate: string;
  customer: string;
  items: string;
  totalAmount: string;
  paymentMethod: string;
  paymentStatus: string;
  paid: string;
  pending: string;
  refunded: string;
  partiallyPaid: string;
  cash: string;
  card: string;
  bankTransfer: string;
  other: string;
  viewTransaction: string;
  printReceipt: string;
  refund: string;
  refundAmount: string;
  refundReason: string;

  // Reports
  dailyReport: string;
  monthlyReport: string;
  yearlyReport: string;
  customReport: string;
  startDate: string;
  endDate: string;
  totalSales: string;
  totalRevenue: string;
  totalProfit: string;
  totalExpenses: string;
  netProfit: string;
  numberOfTransactions: string;
  averageTransactionValue: string;
  lowPerformingProducts: string;
  salesByCategory: string;
  salesByBrand: string;
  salesByCustomer: string;
  salesByPaymentMethod: string;
  exportReport: string;
  printReport: string;

  // Expenses
  expenseName: string;
  expenseCategory: string;
  expenseAmount: string;
  expenseDate: string;
  expenseDescription: string;
  addExpense: string;
  editExpense: string;
  deleteExpense: string;
  expenseDetails: string;

  // Shop/Branch
  shopName: string;
  branchName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  addShop: string;
  editShop: string;
  deleteShop: string;
  shopDetails: string;
  selectBranch: string;
  currentBranch: string;
  switchBranch: string;

  // Staff
  staffName: string;
  staffEmail: string;
  staffPhone: string;
  staffRole: string;
  addStaff: string;
  editStaff: string;
  deleteStaff: string;
  staffDetails: string;
  owner: string;
  manager: string;
  staff_role: string;
  permissions: string;

  // Settings
  businessName: string;
  businessLogo: string;
  taxRate: string;
  currency: string;
  language: string;
  theme: string;
  notifications: string;
  receiptSettings: string;
  barcodeSettings: string;
  generalSettings: string;
  advancedSettings: string;

  // Cart
  shoppingCart: string;
  addToCart: string;
  removeFromCart: string;
  clearCart: string;
  checkout: string;
  cartEmpty: string;
  continueShopping: string;
  proceedToCheckout: string;

  // Payment
  paymentDetails: string;
  amountReceived: string;
  change: string;
  completePayment: string;
  paymentSuccessful: string;
  paymentFailed: string;

  // Barcode
  generateBarcode: string;
  printBarcode: string;
  barcodeFormat: string;
  barcodeSize: string;
  includePriceOnLabel: string;
  includeProductName: string;

  // Dashboard
  overview: string;
  todaySales: string;
  thisWeekSales: string;
  thisMonthSales: string;
  recentTransactions: string;
  topProducts: string;
  quickActions: string;
  ownerDashboard: string;
  allBranches: string;
  today: string;
  last7Days: string;
  last30Days: string;
  last90Days: string;
  customRange: string;
  totalOrders: string;
  totalCustomers: string;
  totalSalesThb: string;
  totalExpenseThb: string;
  totalSalesMmk: string;
  totalExpenseMmk: string;
  avgOrderValue: string;
  itemsSold: string;
  totalProducts: string;
  lowStockItems: string;
  completed: string;
  cancelled: string;
  failed: string;
  refundPayments: string;
  partialRefunds: string;
  scan: string;
  wallet: string;
  cod: string;
  totalSaleProfitTrend: string;
  promotionRevenueRelationship: string;
  promotionDiscount: string;
  discountRate: string;
  orderStatusDistribution: string;
  dailyOrdersTrend: string;
  topSellingProducts: string;
  recentActivity: string;
  sold: string;
  orders: string;
  dailyOrders: string;
  noRevenueData: string;
  noPromotionData: string;
  noOrderData: string;
  noSalesData: string;
  noRecentActivity: string;

  // Retail analytics
  sellThroughBySize: string;
  sellThroughBySizeHint: string;
  sellThroughBySizeFootnote: string;
  sellThroughRate: string;
  unitsSold: string;
  unitsRemaining: string;
  fastestSize: string;
  noSizeData: string;
  netMarginTrend: string;
  netMarginTrendHint: string;
  netMarginTrendFootnote: string;
  netMarginRate: string;
  grossProfit: string;
  operatingExpenses: string;
  netResult: string;
  noMarginData: string;
  inventoryAging: string;
  inventoryAgingHint: string;
  inventoryAgingFootnote: string;
  daysOnSale: string;
  capitalTied: string;
  deadStockCapital: string;
  stockHealthNew: string;
  stockHealthHealthy: string;
  stockHealthSlow: string;
  stockHealthDead: string;
  lines: string;
  noInventoryData: string;
  returnRateBySize: string;
  returnRateBySizeHint: string;
  returnRateBySizeFootnote: string;
  returnRate: string;
  averageReturnRate: string;
  refundValue: string;
  average: string;
  noReturnData: string;
  staffPerformance: string;
  staffPerformanceHint: string;
  staffPerformanceFootnote: string;
  averageBasket: string;
  discountGiven: string;
  refundRate: string;
  unattributedSales: string;
  unattributedNotice: string;
  noStaffAttribution: string;
  salesChannelSplit: string;
  salesChannelSplitHint: string;
  salesChannelSplitFootnote: string;
  inStoreSales: string;
  onlineSales: string;
  onlineShare: string;

  // Membership / loyalty economics
  membershipProfitability: string;
  membershipProfitabilityHint: string;
  membershipProfitabilityFootnote: string;
  members: string;
  nonMembers: string;
  ordersPerCustomer: string;
  loyaltyCost: string;
  netProfitAfterLoyalty: string;
  grossMarginRate: string;
  basketUplift: string;
  walkInExcludedNotice: string;
  noMembershipData: string;
  loyaltyCostTrend: string;
  loyaltyCostTrendHint: string;
  loyaltyCostTrendFootnote: string;
  loyaltyCostRate: string;
  memberRevenue: string;
  noLoyaltyActivity: string;
  loyaltyLiability: string;
  loyaltyLiabilityHint: string;
  loyaltyLiabilityFootnote: string;
  pointsOutstanding: string;
  pointsEarnedLifetime: string;
  estimatedLiability: string;
  rewardsRedeemable: string;
  estimated: string;
  redemptionRate: string;
  breakageRate: string;
  coupons: string;
  couponsIssued: string;
  couponsUsed: string;
  couponsActive: string;
  couponsExpired: string;

  // Transactions
  totalTransactions: string;
  allStatus: string;
  partiallyRefunded: string;
  allPaymentMethods: string;
  scanPayment: string;
  allTime: string;
  searchTransactions: string;

  // Reports
  remainingStockValueUnit: string;
  remainingStockValueOriginal: string;
  totalNetProfit: string;
  avgTransactionValue: string;
  dailyStatus: string;

  // Payments
  successfulPayments: string;
  cancelledPayments: string;
  paymentMethodsBreakdown: string;
  cashPayments: string;
  scanPayments: string;
  walletPayments: string;
  codPayments: string;
  transaction: string;
  amount: string;
  noPaymentsFound: string;
  sellingCurrency: string;
  walkInCustomer: string;
  rate: string;
  rowsPerPage: string;
  showingPayments: string;
  showingTransactions: string;
  units: string;
  quantitySold: string;
  totalSale: string;
  performance: string;
  soldBy: string;
  dateTime: string;
  netSales: string;
  types: string;

  // Auth
  login: string;
  email: string;
  password: string;
  forgotPassword: string;
  rememberMe: string;
  signIn: string;
  signOut: string;

  // Validation messages
  fieldRequired: string;
  invalidEmail: string;
  invalidPhone: string;
  invalidAmount: string;
  confirmDelete: string;
  deleteConfirmMessage: string;
  cannotBeUndone: string;

  // Days and Months
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  january: string;
  february: string;
  march: string;
  april: string;
  may: string;
  june: string;
  july: string;
  august: string;
  september: string;
  october: string;
  november: string;
  december: string;

  // Additional common phrases
  selectOption: string;
  chooseFile: string;
  dragDropFile: string;
  uploadSuccess: string;
  uploadFailed: string;
  processingPleaseWait: string;
  saved: string;
  deleted: string;
  updated: string;
  created: string;
  branch: string;
  wholesaleTier: string;
  minQuantity: string;
  pricePerUnit: string;
  tier: string;
  payNow: string;
  totalItems: string;
  grandTotal: string;
  selectCustomer: string;
  newCustomer: string;
  phone: string;
  address: string;
  receipt: string;
  receiptNumber: string;
  cashier: string;
  paymentReceived: string;
  thankYou: string;
  visitAgain: string;
  itemsInCart: string;
  productsSearch: string;
  filterByCategory: string;
  filterByBrand: string;
  clearFilters: string;
  allCategories: string;
  allBrands: string;
  sortBy: string;
  priceHighToLow: string;
  priceLowToHigh: string;
  nameAToZ: string;
  nameZToA: string;
  newProduct: string;
  wholeSale: string;
  retail: string;
  mixed: string;
  viewDetails: string;
  quickView: string;
  stockAvailable: string;
  addToCartNow: string;
  updateProduct: string;
  deleteProduct: string;
  confirmDeleteProduct: string;
  active: string;
  inactive: string;
  unit: string;
  piece: string;
  productCode: string;
  supplier: string;
  purchaseDate: string;
  expiryDate: string;
  notes: string;
  taxIncluded: string;
  taxExcluded: string;
  inclusive: string;
  exclusive: string;
  cashPayment: string;
  cardPayment: string;
  mobilePayment: string;
  creditPayment: string;
  refundTransaction: string;
  voidTransaction: string;
  duplicateReceipt: string;
  emailReceipt: string;
  smsReceipt: string;
  printInvoice: string;
  downloadPdf: string;
  exportExcel: string;
  exportCsv: string;
  importData: string;
  bulkUpload: string;
  template: string;
  downloadTemplate: string;
  uploadFile: string;
  validateData: string;
  totalRecords: string;
  successfulImports: string;
  failedImports: string;
  viewErrors: string;
  retry: string;
  back: string;
  forward: string;
  refresh: string;
  reload: string;
  help: string;
  support: string;
  documentation: string;
  version: string;
  aboutUs: string;
  contactUs: string;
  privacyPolicy: string;
  termsOfService: string;
  account: string;
  profile: string;
  changePassword: string;
  updateProfile: string;
  profileSettings: string;
  accountSettings: string;
  securitySettings: string;
  twoFactorAuth: string;
  sessionManagement: string;
  loginHistory: string;
  deviceManagement: string;
  backup: string;
  restore: string;
  dataExport: string;
  dataImport: string;
  systemLogs: string;
  auditTrail: string;
  userActivity: string;
  lastUpdated: string;
  createdBy: string;
  modifiedBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    // TopNavBar
    mainCurrency: "Main Currency:",
    noBranch: "No Branch",
    mainBranch: "Main Branch",
    logout: "Logout",

    // Sidebar Menu
    home: "Home",
    dashboard: "Dashboard",
    sales: "Sales",
    transactions: "Transactions",
    reports: "Reports",
    payments: "Payments",
    inventory: "Inventory",
    stocks: "Stocks",
    customers: "Customers",
    expenses: "Expenses",
    barcode: "Barcode",
    labelPrint: "Label Print",
    printSettings: "Print Settings",
    shopsBranches: "Shops & Branches",
    manageShops: "Manage Shops",
    shopReports: "Shop Reports",
    staff: "Staff",
    settings: "Settings",

    // Common words
    search: "Search",
    filter: "Filter",
    add: "Add",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    next: "Next",
    previous: "Previous",
    submit: "Submit",
    reset: "Reset",
    clear: "Clear",
    apply: "Apply",
    view: "View",
    details: "Details",
    actions: "Actions",
    status: "Status",
    date: "Date",
    time: "Time",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    tax: "Tax",
    required: "Required",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    all: "All",
    none: "None",
    loading: "Loading...",
    noData: "No data available",
    noResults: "No results found",
    error: "Error",
    success: "Success",
    warning: "Warning",
    info: "Info",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    showing: "Showing",
    of: "of",
    entries: "entries",
    perPage: "per page",
    showing_entries: "Showing {start} to {end} of {total} entries",

    // Stock/Inventory
    productName: "Product Name",
    category: "Category",
    brand: "Brand",
    color: "Color",
    size: "Size",
    quantity: "Quantity",
    price: "Price",
    originalPrice: "Original Price",
    original: "Original",
    sellingPrice: "Selling Price",
    wholesalePrice: "Wholesale Price",
    retailPrice: "Retail Price",
    costPrice: "Cost Price",
    profit: "Profit",
    profitMargin: "Profit Margin",
    inStock: "In Stock",
    outOfStock: "Out of Stock",
    lowStock: "Low Stock",
    addStock: "Add Stock",
    editStock: "Edit Stock",
    deleteStock: "Delete Stock",
    stockDetails: "Stock Details",
    variants: "Variants",
    addVariant: "Add Variant",
    images: "Images",
    uploadImage: "Upload Image",
    description: "Description",
    sku: "SKU",
    barcode_label: "Barcode",

    // Customer
    customerName: "Customer Name",
    customerPhone: "Customer Phone",
    customerEmail: "Customer Email",
    customerAddress: "Customer Address",
    addCustomer: "Add Customer",
    editCustomer: "Edit Customer",
    deleteCustomer: "Delete Customer",
    customerDetails: "Customer Details",
    totalPurchases: "Total Purchases",
    lastPurchase: "Last Purchase",

    // Transaction
    transactionId: "Transaction ID",
    transactionDate: "Transaction Date",
    customer: "Customer",
    items: "Items",
    totalAmount: "Total Amount",
    paymentMethod: "Payment Method",
    paymentStatus: "Payment Status",
    paid: "Paid",
    pending: "Pending",
    refunded: "Refunded",
    partiallyPaid: "Partially Paid",
    cash: "Cash",
    card: "Card",
    bankTransfer: "Bank Transfer",
    other: "Other",
    viewTransaction: "View Transaction",
    printReceipt: "Print Receipt",
    refund: "Refund",
    refundAmount: "Refund Amount",
    refundReason: "Refund Reason",

    // Reports
    dailyReport: "Daily Report",
    monthlyReport: "Monthly Report",
    yearlyReport: "Yearly Report",
    customReport: "Custom Report",
    startDate: "Start Date",
    endDate: "End Date",
    totalSales: "Total Sales",
    totalRevenue: "Total Revenue",
    totalProfit: "Total Profit",
    totalExpenses: "Total Expenses",
    netProfit: "Net Profit",
    numberOfTransactions: "Number of Transactions",
    averageTransactionValue: "Average Transaction Value",
    topSellingProducts: "Top Selling Products",
    lowPerformingProducts: "Low Performing Products",
    salesByCategory: "Sales by Category",
    salesByBrand: "Sales by Brand",
    salesByCustomer: "Sales by Customer",
    salesByPaymentMethod: "Sales by Payment Method",
    exportReport: "Export Report",
    printReport: "Print Report",

    // Expenses
    expenseName: "Expense Name",
    expenseCategory: "Expense Category",
    expenseAmount: "Expense Amount",
    expenseDate: "Expense Date",
    expenseDescription: "Expense Description",
    addExpense: "Add Expense",
    editExpense: "Edit Expense",
    deleteExpense: "Delete Expense",
    expenseDetails: "Expense Details",

    // Shop/Branch
    shopName: "Shop Name",
    branchName: "Branch Name",
    shopAddress: "Shop Address",
    shopPhone: "Shop Phone",
    shopEmail: "Shop Email",
    addShop: "Add Shop",
    editShop: "Edit Shop",
    deleteShop: "Delete Shop",
    shopDetails: "Shop Details",
    selectBranch: "Select Branch",
    currentBranch: "Current Branch",
    switchBranch: "Switch Branch",

    // Staff
    staffName: "Staff Name",
    staffEmail: "Staff Email",
    staffPhone: "Staff Phone",
    staffRole: "Staff Role",
    addStaff: "Add Staff",
    editStaff: "Edit Staff",
    deleteStaff: "Delete Staff",
    staffDetails: "Staff Details",
    owner: "Owner",
    manager: "Manager",
    staff_role: "Staff",
    permissions: "Permissions",

    // Settings
    businessName: "Business Name",
    businessLogo: "Business Logo",
    taxRate: "Tax Rate",
    currency: "Currency",
    language: "Language",
    theme: "Theme",
    notifications: "Notifications",
    receiptSettings: "Receipt Settings",
    barcodeSettings: "Barcode Settings",
    generalSettings: "General Settings",
    advancedSettings: "Advanced Settings",

    // Cart
    shoppingCart: "Shopping Cart",
    addToCart: "Add to Cart",
    removeFromCart: "Remove from Cart",
    clearCart: "Clear Cart",
    checkout: "Checkout",
    cartEmpty: "Cart is empty",
    continueShopping: "Continue Shopping",
    proceedToCheckout: "Proceed to Checkout",

    // Payment
    paymentDetails: "Payment Details",
    amountReceived: "Amount Received",
    change: "Change",
    completePayment: "Complete Payment",
    paymentSuccessful: "Payment Successful",
    paymentFailed: "Payment Failed",

    // Barcode
    generateBarcode: "Generate Barcode",
    printBarcode: "Print Barcode",
    barcodeFormat: "Barcode Format",
    barcodeSize: "Barcode Size",
    includePriceOnLabel: "Include Price on Label",
    includeProductName: "Include Product Name",

    // Dashboard
    overview: "Overview",
    todaySales: "Today's Sales",
    thisWeekSales: "This Week's Sales",
    thisMonthSales: "This Month's Sales",
    recentTransactions: "Recent Transactions",
    topProducts: "Top Products",
    quickActions: "Quick Actions",
    ownerDashboard: "Owner Dashboard",
    allBranches: "All Branches",
    today: "Today",
    last7Days: "Last 7 days",
    last30Days: "Last 30 days",
    last90Days: "Last 90 days",
    customRange: "Custom Range",
    totalOrders: "Total Orders",
    totalCustomers: "Total Customers",
    totalSalesThb: "Total Sales (฿)",
    totalExpenseThb: "Total Expense (฿)",
    totalSalesMmk: "Total Sale (Ks)",
    totalExpenseMmk: "Total Expense (Ks)",
    avgOrderValue: "Avg Order Value",
    itemsSold: "Items Sold",
    totalProducts: "Total Products",
    lowStockItems: "Low Stock Items",
    completed: "Completed",
    cancelled: "Cancelled",
    failed: "Failed",
    refundPayments: "Refund Payments",
    partialRefunds: "Partial Refunds",
    scan: "Scan",
    wallet: "Wallet",
    cod: "COD",
    totalSaleProfitTrend: "Total Sale & Profit Trend",
    promotionRevenueRelationship: "Promotion & Revenue Relationship",
    promotionDiscount: "Promotion Discount",
    discountRate: "Discount Rate",
    orderStatusDistribution: "Order Status Distribution",
    dailyOrdersTrend: "Daily Orders Trend",
    recentActivity: "Recent Activity",
    sold: "sold",
    orders: "orders",
    dailyOrders: "Daily Orders",
    noRevenueData: "No revenue data available",
    noPromotionData: "No promotion data available",
    noOrderData: "No order data available",
    noSalesData: "No sales data available",
    noRecentActivity: "No recent activity",

    // Retail analytics
    sellThroughBySize: "Sell-Through by Size",
    sellThroughBySizeHint:
      "How much of each size has actually sold. Sets the size curve for your next purchase order.",
    sellThroughBySizeFootnote:
      "Sell-through = units sold ÷ (units sold + units on hand). Received quantities are not stored separately, so on-hand stock is used as the denominator. Sizes above 85% may indicate lost sales from stocking out.",
    sellThroughRate: "Sell-Through Rate",
    unitsSold: "Units Sold",
    unitsRemaining: "Units On Hand",
    fastestSize: "Fastest",
    noSizeData: "No size data available",
    netMarginTrend: "Net Margin: Profit vs Expenses",
    netMarginTrendHint:
      "Gross profit against operating expenses. What is actually left over after running costs.",
    netMarginTrendFootnote:
      "Gross profit uses the price the customer paid, net of refunds. MMK expenses are converted to THB at your configured rate. Net margin is net result ÷ net revenue.",
    netMarginRate: "Net Margin %",
    grossProfit: "Gross Profit",
    operatingExpenses: "Expenses",
    netResult: "Net",
    noMarginData: "No profit or expense data in this period",
    inventoryAging: "Inventory Aging & Dead Stock",
    inventoryAgingHint:
      "Days on sale against sell-through, sized by cash tied up. Bottom-right is the markdown list.",
    inventoryAgingFootnote:
      "Bubble size is unsold units × cost price. Age runs from release date, falling back to creation date. Dead = 90+ days on sale with under 25% sold; slow = under 25% sold; new = under 30 days.",
    daysOnSale: "Days On Sale",
    capitalTied: "Capital Tied Up",
    deadStockCapital: "Dead stock",
    stockHealthNew: "New",
    stockHealthHealthy: "Healthy",
    stockHealthSlow: "Slow",
    stockHealthDead: "Dead",
    lines: "lines",
    noInventoryData: "No inventory data available",
    returnRateBySize: "Return Rate by Size",
    returnRateBySizeHint:
      "Returns concentrated in one size point at a fit problem. Returns spread evenly point at quality.",
    returnRateBySizeFootnote:
      "Return rate = units refunded ÷ gross units sold in that size. The dashed line is this shop's own average; bars in red exceed it by 50% or more.",
    returnRate: "Return Rate",
    averageReturnRate: "Average",
    refundValue: "Refund Value",
    average: "Average",
    noReturnData: "No returns in this period",
    staffPerformance: "Sales by Staff",
    staffPerformanceHint:
      "Revenue per operator with the discount rate they authorised. Read the two together.",
    staffPerformanceFootnote:
      "Discount rate is promotional value ÷ gross sales. A high rate on high revenue can be good selling; the same rate on low revenue is worth a conversation. Refund rate is the share of that operator's orders with a refund against them.",
    averageBasket: "Avg Basket",
    discountGiven: "Discount Given",
    refundRate: "Refund Rate",
    unattributedSales: "unattributed",
    unattributedNotice:
      "{count} sale(s) carry no cashier attribution. Sales recorded before attribution was added cannot be assigned retroactively; newly completed sales will appear against the operator who rang them up.",
    noStaffAttribution:
      "No attributed sales yet. Completed sales will appear here once staff ring them up.",
    salesChannelSplit: "Sales Channel: Store vs Online",
    salesChannelSplitHint:
      "Where revenue comes from over time. The dashed line is the storefront's share.",
    salesChannelSplitFootnote:
      "Online covers orders marked as web storefront, including COD and QR payments. Both apps write to the same database, so no reconciliation is needed.",
    inStoreSales: "In-Store",
    onlineSales: "Online",
    onlineShare: "Online Share",

    // Membership / loyalty economics
    membershipProfitability: "Membership Profitability",
    membershipProfitabilityHint:
      "What the member cohort is worth per order, and whether it still leads after the discounts handed to them.",
    membershipProfitabilityFootnote:
      "This is a comparison, not proof of cause: frequent shoppers are the ones who join loyalty programmes, so members would out-spend non-members even if the programme changed nothing. A sale counts as a member sale only if it happened on or after that customer's join date. Non-member margin has no loyalty cost to deduct, so its gross and net are the same.",
    members: "Members",
    nonMembers: "Non-Members",
    ordersPerCustomer: "Orders / Customer",
    loyaltyCost: "Loyalty Cost",
    netProfitAfterLoyalty: "Net Profit After Loyalty",
    grossMarginRate: "Gross Margin %",
    basketUplift: "Basket uplift",
    walkInExcludedNotice:
      "{count} sale(s) worth {value} had no customer attached and could not be classified as member or non-member. They are excluded from both columns rather than assumed to be non-member.",
    noMembershipData: "No customer-attributed sales in this period",
    loyaltyCostTrend: "Loyalty Cost vs Member Revenue",
    loyaltyCostTrendHint:
      "What the programme gives away against the member revenue it buys. The dashed line is the cost rate.",
    loyaltyCostTrendFootnote:
      "Cost is coupon value actually redeemed, from both the till and the storefront. Loyalty programmes are normally run at a low single-digit percentage of revenue; a rate sitting above the marked level means the reward tiers are priced too generously for a clothing margin.",
    loyaltyCostRate: "Cost Rate",
    memberRevenue: "Member Revenue",
    noLoyaltyActivity: "No loyalty activity yet",
    loyaltyLiability: "Points Liability & Breakage",
    loyaltyLiabilityHint:
      "Unredeemed points are a promised discount you have not paid yet. Expired coupons are rewards nobody wanted.",
    loyaltyLiabilityFootnote:
      "Liability values the outstanding balance at the cheapest enabled reward tier — the most conservative assumption a customer could make. Percentage-based rewards have no fixed value until applied to a basket, so those are estimated from the average basket. Coupon status is recalculated from the expiry date rather than trusted, because expiry is only processed per customer on demand.",
    pointsOutstanding: "Points Outstanding",
    pointsEarnedLifetime: "Points Earned (Lifetime)",
    estimatedLiability: "Estimated Liability",
    rewardsRedeemable: "rewards redeemable",
    estimated: "estimated",
    redemptionRate: "Redemption Rate",
    breakageRate: "Breakage",
    coupons: "coupons",
    couponsIssued: "Issued",
    couponsUsed: "Used",
    couponsActive: "Active",
    couponsExpired: "Expired",

    // Transactions
    totalTransactions: "Total Transactions",
    allStatus: "All Status",
    partiallyRefunded: "Partially Refunded",
    allPaymentMethods: "All Payment Methods",
    scanPayment: "Scan Payment",
    allTime: "All Time",
    searchTransactions: "Search transactions...",

    // Reports
    remainingStockValueUnit: "Remaining Stock Value (Unit Price)",
    remainingStockValueOriginal: "Remaining Stock Value (Original Price)",
    totalNetProfit: "Total Net Profit",
    avgTransactionValue: "Avg Transaction Value",
    dailyStatus: "Daily Status",

    // Payments
    successfulPayments: "Successful Payments",
    cancelledPayments: "Cancelled Payments",
    paymentMethodsBreakdown: "Payment Methods Breakdown",
    cashPayments: "Cash Payments",
    scanPayments: "Scan Payments",
    walletPayments: "Wallet Payments",
    codPayments: "COD Payments",
    transaction: "Transaction",
    amount: "Amount",
    noPaymentsFound: "No payments found",
    sellingCurrency: "Selling Currency",
    walkInCustomer: "Walk-in customer",
    rate: "Rate",
    rowsPerPage: "Rows per page",
    showingPayments: "Showing {start}–{end} of {total} payments",
    showingTransactions: "Showing {start}–{end} of {total} transactions",
    units: "units",
    quantitySold: "Quantity Sold",
    totalSale: "Total Sale",
    performance: "Performance",
    soldBy: "Sold By",
    dateTime: "Date & Time",
    netSales: "Net Sales",
    types: "type(s)",

    // Auth
    login: "Login",
    email: "Email",
    password: "Password",
    forgotPassword: "Forgot Password",
    rememberMe: "Remember Me",
    signIn: "Sign In",
    signOut: "Sign Out",

    // Validation messages
    fieldRequired: "This field is required",
    invalidEmail: "Invalid email address",
    invalidPhone: "Invalid phone number",
    invalidAmount: "Invalid amount",
    confirmDelete: "Confirm Delete",
    deleteConfirmMessage: "Are you sure you want to delete this item?",
    cannotBeUndone: "This action cannot be undone",

    // Days and Months
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    january: "January",
    february: "February",
    march: "March",
    april: "April",
    may: "May",
    june: "June",
    july: "July",
    august: "August",
    september: "September",
    october: "October",
    november: "November",
    december: "December",

    // Additional common phrases
    selectOption: "Select an option",
    chooseFile: "Choose file",
    dragDropFile: "Drag & drop file here",
    uploadSuccess: "Upload successful",
    uploadFailed: "Upload failed",
    processingPleaseWait: "Processing, please wait...",
    saved: "Saved successfully",
    deleted: "Deleted successfully",
    updated: "Updated successfully",
    created: "Created successfully",
    branch: "Branch",
    wholesaleTier: "Wholesale Tier",
    minQuantity: "Min Quantity",
    pricePerUnit: "Price per Unit",
    tier: "Tier",
    payNow: "Pay Now",
    totalItems: "Total Items",
    grandTotal: "Grand Total",
    selectCustomer: "Select Customer",
    newCustomer: "New Customer",
    phone: "Phone",
    address: "Address",
    receipt: "Receipt",
    receiptNumber: "Receipt Number",
    cashier: "Cashier",
    paymentReceived: "Payment Received",
    thankYou: "Thank You",
    visitAgain: "Please visit again!",
    itemsInCart: "Items in Cart",
    productsSearch: "Search products...",
    filterByCategory: "Filter by Category",
    filterByBrand: "Filter by Brand",
    clearFilters: "Clear Filters",
    allCategories: "All Categories",
    allBrands: "All Brands",
    sortBy: "Sort By",
    priceHighToLow: "Price: High to Low",
    priceLowToHigh: "Price: Low to High",
    nameAToZ: "Name: A to Z",
    nameZToA: "Name: Z to A",
    newProduct: "New Product",
    wholeSale: "Wholesale",
    retail: "Retail",
    mixed: "Mixed",
    viewDetails: "View Details",
    quickView: "Quick View",
    stockAvailable: "Stock Available",
    addToCartNow: "Add to Cart",
    updateProduct: "Update Product",
    deleteProduct: "Delete Product",
    confirmDeleteProduct: "Confirm Delete Product",
    active: "Active",
    inactive: "Inactive",
    unit: "Unit",
    piece: "Piece",
    productCode: "Product Code",
    supplier: "Supplier",
    purchaseDate: "Purchase Date",
    expiryDate: "Expiry Date",
    notes: "Notes",
    taxIncluded: "Tax Included",
    taxExcluded: "Tax Excluded",
    inclusive: "Inclusive",
    exclusive: "Exclusive",
    cashPayment: "Cash Payment",
    cardPayment: "Card Payment",
    mobilePayment: "Mobile Payment",
    creditPayment: "Credit Payment",
    refundTransaction: "Refund Transaction",
    voidTransaction: "Void Transaction",
    duplicateReceipt: "Duplicate Receipt",
    emailReceipt: "Email Receipt",
    smsReceipt: "SMS Receipt",
    printInvoice: "Print Invoice",
    downloadPdf: "Download PDF",
    exportExcel: "Export Excel",
    exportCsv: "Export CSV",
    importData: "Import Data",
    bulkUpload: "Bulk Upload",
    template: "Template",
    downloadTemplate: "Download Template",
    uploadFile: "Upload File",
    validateData: "Validate Data",
    totalRecords: "Total Records",
    successfulImports: "Successful Imports",
    failedImports: "Failed Imports",
    viewErrors: "View Errors",
    retry: "Retry",
    back: "Back",
    forward: "Forward",
    refresh: "Refresh",
    reload: "Reload",
    help: "Help",
    support: "Support",
    documentation: "Documentation",
    version: "Version",
    aboutUs: "About Us",
    contactUs: "Contact Us",
    privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service",
    account: "Account",
    profile: "Profile",
    changePassword: "Change Password",
    updateProfile: "Update Profile",
    profileSettings: "Profile Settings",
    accountSettings: "Account Settings",
    securitySettings: "Security Settings",
    twoFactorAuth: "Two-Factor Authentication",
    sessionManagement: "Session Management",
    loginHistory: "Login History",
    deviceManagement: "Device Management",
    backup: "Backup",
    restore: "Restore",
    dataExport: "Data Export",
    dataImport: "Data Import",
    systemLogs: "System Logs",
    auditTrail: "Audit Trail",
    userActivity: "User Activity",
    lastUpdated: "Last Updated",
    createdBy: "Created By",
    modifiedBy: "Modified By",
    createdAt: "Created At",
    updatedAt: "Updated At",
    deletedAt: "Deleted At",
  },
  my: {
    // TopNavBar
    mainCurrency: "အဓိက ငွေကြေး:",
    noBranch: "ဘရန်ခ်ျ မရှိ",
    mainBranch: "ပင်မဘရန်ခ်ျ",
    logout: "ထွက်မည်",

    // Sidebar Menu
    home: "ပင်မစာမျက်နှာ",
    dashboard: "ဒက်ရှ်ဘုတ်",
    sales: "ရောင်းချမှု",
    transactions: "ငွေလွှဲပြောင်းမှုများ",
    reports: "အစီရင်ခံစာများ",
    payments: "ငွေပေးချေမှုများ",
    inventory: "ကုန်စာရင်း",
    stocks: "စတော့ခ်များ",
    customers: "ဖောက်သည်များ",
    expenses: "ကုန်ကျစရိတ်များ",
    barcode: "ဘားကုဒ်",
    labelPrint: "တံဆိပ်ပုံနှိပ်ခြင်း",
    printSettings: "ပုံနှိပ်ဆက်တင်များ",
    shopsBranches: "ဆိုင်များနှင့် ဘရန်ခ်ျများ",
    manageShops: "ဆိုင်များစီမံခန့်ခွဲခြင်း",
    shopReports: "ဆိုင်အစီရင်ခံစာများ",
    staff: "ဝန်ထမ်းများ",
    settings: "ဆက်တင်များ",

    // Common words
    search: "ရှာဖွေရန်",
    filter: "စစ်ထုတ်ရန်",
    add: "ထည့်ရန်",
    edit: "တည်းဖြတ်ရန်",
    delete: "ဖျက်ရန်",
    save: "သိမ်းဆည်းရန်",
    cancel: "ပယ်ဖျက်ရန်",
    confirm: "အတည်ပြုရန်",
    close: "ပိတ်ရန်",
    next: "နောက်တစ်ခု",
    previous: "ယခင်တစ်ခု",
    submit: "တင်သွင်းရန်",
    reset: "ပြန်လည်သတ်မှတ်ရန်",
    clear: "ရှင်းလင်းရန်",
    apply: "လျှောက်ထားရန်",
    view: "ကြည့်ရှုရန်",
    details: "အသေးစိတ်များ",
    actions: "လုပ်ဆောင်ချက်များ",
    status: "အခြေအနေ",
    date: "ရက်စွဲ",
    time: "အချိန်",
    total: "စုစုပေါင်း",
    subtotal: "ခွဲစုစုပေါင်း",
    discount: "လျှော့ဈေး",
    tax: "အခွန်",
    required: "လိုအပ်သည်",
    optional: "စိတ်ကြိုက်",
    yes: "ဟုတ်ကဲ့",
    no: "မဟုတ်ဘူး",
    all: "အားလုံး",
    none: "မရှိ",
    loading: "တင်နေသည်...",
    noData: "ဒေတာမရှိပါ",
    noResults: "ရလဒ်မတွေ့ပါ",
    error: "အမှား",
    success: "အောင်မြင်",
    warning: "သတိပေးချက်",
    info: "အချက်အလက်",
    selectAll: "အားလုံးရွေးရန်",
    deselectAll: "အားလုံးဖြုတ်ရန်",
    showing: "ပြသနေသည်",
    of: "၏",
    entries: "ဖော်ပြချက်များ",
    perPage: "တစ်စာမျက်နှာလျှင်",
    showing_entries: "{start} မှ {end} အထိ ပြသနေသည် (စုစုပေါင်း {total})",

    // Stock/Inventory
    productName: "ကုန်ပစ္စည်းအမည်",
    category: "အမျိုးအစား",
    brand: "ကုန်အမှတ်တံဆိပ်",
    color: "အရောင်",
    size: "အရွယ်အစား",
    quantity: "အရေအတွက်",
    price: "စျေးနှုန်း",
    originalPrice: "မူလစျေးနှုန်း",
    original: "မူလ",
    sellingPrice: "ရောင်းစျေးနှုန်း",
    wholesalePrice: "လက်ကားစျေးနှုန်း",
    retailPrice: "လက်လီစျေးနှုန်း",
    costPrice: "ဝယ်စျေးနှုန်း",
    profit: "အမြတ်",
    profitMargin: "အမြတ်နှုန်း",
    inStock: "စတော့ရှိ",
    outOfStock: "စတော့ကုန်",
    lowStock: "စတော့နည်း",
    addStock: "စတော့ထည့်ရန်",
    editStock: "စတော့တည်းဖြတ်ရန်",
    deleteStock: "စတော့ဖျက်ရန်",
    stockDetails: "စတော့အသေးစိတ်",
    variants: "မျိုးကွဲများ",
    addVariant: "မျိုးကွဲထည့်ရန်",
    images: "ပုံများ",
    uploadImage: "ပုံတင်ရန်",
    description: "ဖော်ပြချက်",
    sku: "ကုတ်နံပါတ်",
    barcode_label: "ဘားကုဒ်",

    // Customer
    customerName: "ဖောက်သည်အမည်",
    customerPhone: "ဖောက်သည်ဖုန်း",
    customerEmail: "ဖောက်သည်အီးမေးလ်",
    customerAddress: "ဖောက်သည်လိပ်စာ",
    addCustomer: "ဖောက်သည်ထည့်ရန်",
    editCustomer: "ဖောက်သည်တည်းဖြတ်ရန်",
    deleteCustomer: "ဖောက်သည်ဖျက်ရန်",
    customerDetails: "ဖောက်သည်အသေးစိတ်",
    totalPurchases: "စုစုပေါင်းဝယ်ယူမှု",
    lastPurchase: "နောက်ဆုံးဝယ်ယူမှု",

    // Transaction
    transactionId: "ငွေလွှဲပြောင်းနံပါတ်",
    transactionDate: "ငွေလွှဲပြောင်းရက်စွဲ",
    customer: "ဖောက်သည်",
    items: "ပစ္စည်းများ",
    totalAmount: "စုစုပေါင်းငွေပမာဏ",
    paymentMethod: "ငွေပေးချေနည်းလမ်း",
    paymentStatus: "ငွေပေးချေအခြေအနေ",
    paid: "ပေးပြီး",
    pending: "စောင့်ဆိုင်းဆဲ",
    refunded: "ပြန်အမ်းပြီး",
    partiallyPaid: "တစ်စိတ်တစ်ပိုင်းပေးပြီး",
    cash: "ငွေသား",
    card: "ကတ်",
    bankTransfer: "ဘဏ်လွှဲ",
    other: "အခြား",
    viewTransaction: "ငွေလွှဲကြည့်ရန်",
    printReceipt: "ငွေပြေစာပုံနှိပ်ရန်",
    refund: "ပြန်အမ်းရန်",
    refundAmount: "ပြန်အမ်းငွေပမာဏ",
    refundReason: "ပြန်အမ်းအကြောင်းရင်း",

    // Reports
    dailyReport: "နေ့စဉ်အစီရင်ခံစာ",
    monthlyReport: "လစဉ်အစီရင်ခံစာ",
    yearlyReport: "နှစ်စဉ်အစီရင်ခံစာ",
    customReport: "စိတ်ကြိုက်အစီရင်ခံစာ",
    startDate: "စတင်ရက်စွဲ",
    endDate: "ပြီးဆုံးရက်စွဲ",
    totalSales: "စုစုပေါင်းရောင်းချမှု",
    totalRevenue: "စုစုပေါင်းဝင်ငွေ",
    totalProfit: "စုစုပေါင်းအမြတ်",
    totalExpenses: "စုစုပေါင်းကုန်ကျစရိတ်",
    netProfit: "သန့်အမြတ်",
    numberOfTransactions: "ငွေလွှဲအရေအတွက်",
    averageTransactionValue: "ပျမ်းမျှငွေလွှဲတန်ဖိုး",
    topSellingProducts: "အရောင်းရဆုံးကုန်ပစ္စည်းများ",
    lowPerformingProducts: "အရောင်းနည်းသောကုန်ပစ္စည်းများ",
    salesByCategory: "အမျိုးအစားအလိုက်ရောင်းချမှု",
    salesByBrand: "ကုန်အမှတ်တံဆိပ်အလိုက်ရောင်းချမှု",
    salesByCustomer: "ဖောက်သည်အလိုက်ရောင်းချမှု",
    salesByPaymentMethod: "ငွေပေးချေနည်းအလိုက်ရောင်းချမှု",
    exportReport: "အစီရင်ခံစာထုတ်ယူရန်",
    printReport: "အစီရင်ခံစာပုံနှိပ်ရန်",

    // Expenses
    expenseName: "ကုန်ကျစရိတ်အမည်",
    expenseCategory: "ကုန်ကျစရိတ်အမျိုးအစား",
    expenseAmount: "ကုန်ကျစရိတ်ပမာဏ",
    expenseDate: "ကုန်ကျစရိတ်ရက်စွဲ",
    expenseDescription: "ကုန်ကျစရိတ်ဖော်ပြချက်",
    addExpense: "ကုန်ကျစရိတ်ထည့်ရန်",
    editExpense: "ကုန်ကျစရိတ်တည်းဖြတ်ရန်",
    deleteExpense: "ကုန်ကျစရိတ်ဖျက်ရန်",
    expenseDetails: "ကုန်ကျစရိတ်အသေးစိတ်",

    // Shop/Branch
    shopName: "ဆိုင်အမည်",
    branchName: "ဘရန်ခ်ျအမည်",
    shopAddress: "ဆိုင်လိပ်စာ",
    shopPhone: "ဆိုင်ဖုန်း",
    shopEmail: "ဆိုင်အီးမေးလ်",
    addShop: "ဆိုင်ထည့်ရန်",
    editShop: "ဆိုင်တည်းဖြတ်ရန်",
    deleteShop: "ဆိုင်ဖျက်ရန်",
    shopDetails: "ဆိုင်အသေးစိတ်",
    selectBranch: "ဘရန်ခ်ျရွေးရန်",
    currentBranch: "လက်ရှိဘရန်ခ်ျ",
    switchBranch: "ဘရန်ခ်ျပြောင်းရန်",

    // Staff
    staffName: "ဝန်ထမ်းအမည်",
    staffEmail: "ဝန်ထမ်းအီးမေးလ်",
    staffPhone: "ဝန်ထမ်းဖုန်း",
    staffRole: "ဝန်ထမ်းရာထူး",
    addStaff: "ဝန်ထမ်းထည့်ရန်",
    editStaff: "ဝန်ထမ်းတည်းဖြတ်ရန်",
    deleteStaff: "ဝန်ထမ်းဖျက်ရန်",
    staffDetails: "ဝန်ထမ်းအသေးစိတ်",
    owner: "ပိုင်ရှင်",
    manager: "မန်နေဂျာ",
    staff_role: "ဝန်ထမ်း",
    permissions: "ခွင့်ပြုချက်များ",

    // Settings
    businessName: "စီးပွားရေးအမည်",
    businessLogo: "စီးပွားရေးလိုဂို",
    taxRate: "အခွန်နှုန်း",
    currency: "ငွေကြေး",
    language: "ဘာသာစကား",
    theme: "အခင်းအကျင်း",
    notifications: "အသိပေးချက်များ",
    receiptSettings: "ငွေပြေစာဆက်တင်များ",
    barcodeSettings: "ဘားကုဒ်ဆက်တင်များ",
    generalSettings: "ယေဘုယျဆက်တင်များ",
    advancedSettings: "အဆင့်မြင့်ဆက်တင်များ",

    // Cart
    shoppingCart: "ဈေးခြင်း",
    addToCart: "ဈေးခြင်းထဲထည့်ရန်",
    removeFromCart: "ဈေးခြင်းမှဖယ်ရန်",
    clearCart: "ဈေးခြင်းသန့်ရှင်းရန်",
    checkout: "ငွေရှင်းရန်",
    cartEmpty: "ဈေးခြင်းဗလာဖြစ်နေသည်",
    continueShopping: "ဆက်လက်ဝယ်ယူရန်",
    proceedToCheckout: "ငွေရှင်းရန်သို့ဆက်သွားရန်",

    // Payment
    paymentDetails: "ငွေပေးချေအသေးစိတ်",
    amountReceived: "လက်ခံရရှိငွေပမာဏ",
    change: "အကြွေ",
    completePayment: "ငွေပေးချေမှုပြီးမြောက်ရန်",
    paymentSuccessful: "ငွေပေးချေမှုအောင်မြင်",
    paymentFailed: "ငွေပေးချေမှုမအောင်မြင်",

    // Barcode
    generateBarcode: "ဘားကုဒ်ထုတ်ရန်",
    printBarcode: "ဘားကုဒ်ပုံနှိပ်ရန်",
    barcodeFormat: "ဘားကုဒ်ပုံစံ",
    barcodeSize: "ဘားကုဒ်အရွယ်အစား",
    includePriceOnLabel: "တံဆိပ်ပေါ်တွင်စျေးနှုန်းပါဝင်စေရန်",
    includeProductName: "ကုန်ပစ္စည်းအမည်ပါဝင်စေရန်",

    // Dashboard
    overview: "ခြုံငုံသုံးသပ်ချက်",
    todaySales: "ယနေ့ရောင်းချမှု",
    thisWeekSales: "ဒီအပတ်ရောင်းချမှု",
    thisMonthSales: "ဒီလရောင်းချမှု",
    recentTransactions: "မကြာမီငွေလွှဲပြောင်းမှုများ",
    topProducts: "အရောင်းရဆုံးကုန်ပစ္စည်းများ",
    quickActions: "မြန်ဆန်သောလုပ်ဆောင်ချက်များ",
    ownerDashboard: "ပိုင်ရှင်ဒက်ရှ်ဘုတ်",
    allBranches: "ဘရန်ခ်ျအားလုံး",
    today: "ယနေ့",
    last7Days: "လွန်ခဲ့သော ၇ ရက်",
    last30Days: "လွန်ခဲ့သော ၃၀ ရက်",
    last90Days: "လွန်ခဲ့သော ၉၀ ရက်",
    customRange: "စိတ်ကြိုက်ရက်အပိုင်းအခြား",
    totalOrders: "စုစုပေါင်းမှာယူမှုများ",
    totalCustomers: "စုစုပေါင်းဖောက်သည်များ",
    totalSalesThb: "စုစုပေါင်းရောင်းချမှု (฿)",
    totalExpenseThb: "စုစုပေါင်းကုန်ကျစရိတ် (฿)",
    totalSalesMmk: "စုစုပေါင်းရောင်းချမှု (Ks)",
    totalExpenseMmk: "စုစုပေါင်းကုန်ကျစရိတ် (Ks)",
    avgOrderValue: "ပျမ်းမျှမှာယူတန်ဖိုး",
    itemsSold: "ရောင်းချပြီးပစ္စည်းများ",
    totalProducts: "စုစုပေါင်းကုန်ပစ္စည်းများ",
    lowStockItems: "စတော့နည်းသောပစ္စည်းများ",
    completed: "ပြီးမြောက်သော",
    cancelled: "ပယ်ဖျက်သော",
    failed: "မအောင်မြင်",
    refundPayments: "ပြန်အမ်းငွေပေးချေမှုများ",
    partialRefunds: "တစ်စိတ်တစ်ပိုင်းပြန်အမ်းမှုများ",
    scan: "စကန်န်",
    scanPayment: "စကန်နန်ပေးချေမှု",
    wallet: "ပိုက်ဆံအိတ်",
    cod: "ပေးပို့သောအခါငွေပေးရန်",
    totalSaleProfitTrend: "စုစုပေါင်းရောင်းချမှုနှင့်အမြတ်ခြေရာ",
    promotionRevenueRelationship: "ပရိုမိုးရှင်းနှင့် ဝင်ငွေ ဆက်နွှယ်မှု",
    promotionDiscount: "ပရိုမိုးရှင်းလျှော့ငွေ",
    discountRate: "လျှော့ငွေနှုန်း",
    orderStatusDistribution: "မှာယူမှုအခြေအနေဖြန့်ဝေမှု",
    dailyOrdersTrend: "နေ့စဉ်မှာယူမှုခြေရာ",
    recentActivity: "မကြာသေးသောလုပ်ဆောင်ချက်များ",
    sold: "ရောင်းပြီး",
    orders: "မှာယူမှုများ",
    dailyOrders: "နေ့စဉ်မှာယူမှုများ",
    noRevenueData: "ဝင်ငွေဒေတာမရှိပါ",
    noPromotionData: "ပရိုမိုးရှင်းဒေတာမရှိပါ",
    noOrderData: "မှာယူမှုဒေတာမရှိပါ",
    noSalesData: "ရောင်းချမှုဒေတာမရှိပါ",
    noRecentActivity: "မကြာသေးသောလုပ်ဆောင်ချက်မရှိပါ",

    // Retail analytics
    sellThroughBySize: "ဆိုက်အလိုက် ရောင်းအားနှုန်း",
    sellThroughBySizeHint:
      "ဆိုက်တစ်ခုစီ အမှန်တကယ် ရောင်းထွက်မှု။ နောက်တစ်ကြိမ် မှာယူမည့် ဆိုက်အချိုးကို ဆုံးဖြတ်ပေးသည်။",
    sellThroughBySizeFootnote:
      "ရောင်းအားနှုန်း = ရောင်းရသော အရေအတွက် ÷ (ရောင်းရသော + လက်ကျန်)။ လက်ခံရရှိသော အရေအတွက်ကို သီးသန့်မသိမ်းဆည်းသဖြင့် လက်ကျန်ကို အခြေခံသည်။ ၈၅% အထက်ဆိုက်များသည် ကုန်ပြတ်၍ အရောင်းလက်လွတ်နိုင်သည်။",
    sellThroughRate: "ရောင်းအားနှုန်း",
    unitsSold: "ရောင်းရသော အရေအတွက်",
    unitsRemaining: "လက်ကျန်",
    fastestSize: "အမြန်ဆုံး",
    noSizeData: "ဆိုက်ဒေတာမရှိပါ",
    netMarginTrend: "အသားတင်အမြတ်: အမြတ်နှင့် အသုံးစရိတ်",
    netMarginTrendHint:
      "စုစုပေါင်းအမြတ်နှင့် လုပ်ငန်းအသုံးစရိတ် နှိုင်းယှဉ်မှု။ စရိတ်ကျခံပြီးနောက် ကျန်ရှိသောပမာဏ။",
    netMarginTrendFootnote:
      "စုစုပေါင်းအမြတ်ကို ဖောက်သည်ပေးချေသည့်နှုန်းဖြင့် တွက်ချက်ပြီး ပြန်အမ်းငွေများ ခုနှိမ်ထားသည်။ MMK အသုံးစရိတ်များကို သတ်မှတ်နှုန်းဖြင့် THB သို့ ပြောင်းသည်။",
    netMarginRate: "အသားတင်အမြတ် %",
    grossProfit: "စုစုပေါင်းအမြတ်",
    operatingExpenses: "အသုံးစရိတ်",
    netResult: "အသားတင်",
    noMarginData: "ဤကာလအတွင်း အမြတ်သို့မဟုတ် အသုံးစရိတ်ဒေတာမရှိပါ",
    inventoryAging: "ကုန်ပစ္စည်းသက်တမ်းနှင့် ရောင်းမရကုန်",
    inventoryAgingHint:
      "ရောင်းချသည့်ရက်နှင့် ရောင်းအားနှုန်း နှိုင်းယှဉ်မှု၊ ပမာဏသည် ထိုင်နေသောရင်းနှီးမြှုပ်နှံမှု။ အောက်ယာဘက်သည် လျှော့ရောင်းသင့်သည့်စာရင်း။",
    inventoryAgingFootnote:
      "အဝိုင်းအရွယ်အစားသည် လက်ကျန် × အရင်းနှုန်း။ သက်တမ်းကို ထုတ်ရောင်းသည့်ရက်မှ တွက်သည်။ ရောင်းမရ = ရက် ၉၀ အထက်နှင့် ၂၅% အောက်ရောင်းရ၊ နှေး = ၂၅% အောက်၊ အသစ် = ရက် ၃၀ အောက်။",
    daysOnSale: "ရောင်းချသည့်ရက်",
    capitalTied: "ထိုင်နေသောရင်းနှီးမြှုပ်နှံမှု",
    deadStockCapital: "ရောင်းမရကုန်",
    stockHealthNew: "အသစ်",
    stockHealthHealthy: "ကောင်းမွန်",
    stockHealthSlow: "နှေးကွေး",
    stockHealthDead: "ရောင်းမရ",
    lines: "အမျိုးအစား",
    noInventoryData: "ကုန်ပစ္စည်းဒေတာမရှိပါ",
    returnRateBySize: "ဆိုက်အလိုက် ပြန်ပို့မှုနှုန်း",
    returnRateBySizeHint:
      "ဆိုက်တစ်ခုတည်းတွင် ပြန်ပို့မှုစုစည်းနေပါက ဆိုက်တိုင်းတာမှုပြဿနာ။ ဆိုက်အားလုံးတွင် ညီညာနေပါက အရည်အသွေးပြဿနာ။",
    returnRateBySizeFootnote:
      "ပြန်ပို့မှုနှုန်း = ပြန်အမ်းအရေအတွက် ÷ ထိုဆိုက်၏ စုစုပေါင်းရောင်းရအရေအတွက်။ အစက်မျဉ်းသည် ဆိုင်၏ ပျမ်းမျှနှုန်း၊ အနီရောင်တန်းများသည် ၅၀% ကျော်လွန်နေသည်။",
    returnRate: "ပြန်ပို့မှုနှုန်း",
    averageReturnRate: "ပျမ်းမျှ",
    refundValue: "ပြန်အမ်းငွေပမာဏ",
    average: "ပျမ်းမျှ",
    noReturnData: "ဤကာလအတွင်း ပြန်ပို့မှုမရှိပါ",
    staffPerformance: "ဝန်ထမ်းအလိုက် အရောင်း",
    staffPerformanceHint:
      "ဝန်ထမ်းတစ်ဦးချင်း ဝင်ငွေနှင့် သူတို့ခွင့်ပြုသော လျှော့ငွေနှုန်း။ နှစ်ခုတွဲဖတ်ပါ။",
    staffPerformanceFootnote:
      "လျှော့ငွေနှုန်း = ပရိုမိုးရှင်းပမာဏ ÷ စုစုပေါင်းအရောင်း။ ဝင်ငွေမြင့်စဉ် နှုန်းမြင့်ခြင်းသည် ရောင်းအားကောင်းမှုဖြစ်နိုင်သည်။ ဝင်ငွေနိမ့်စဉ် နှုန်းမြင့်ပါက စစ်ဆေးသင့်သည်။",
    averageBasket: "ပျမ်းမျှတစ်ခေါက်",
    discountGiven: "ပေးသောလျှော့ငွေ",
    refundRate: "ပြန်အမ်းနှုန်း",
    unattributedSales: "မသတ်မှတ်ရသေး",
    unattributedNotice:
      "အရောင်း {count} ခုတွင် ရောင်းချသူ မှတ်တမ်းမရှိပါ။ ဤစနစ်မတိုင်မီ မှတ်တမ်းတင်ထားသော အရောင်းများကို ပြန်သတ်မှတ်၍မရပါ။ အသစ်ပြီးစီးသော အရောင်းများသည် ရောင်းချသူအလိုက် ပေါ်လာမည်။",
    noStaffAttribution:
      "မှတ်တမ်းတင်ထားသော အရောင်းမရှိသေးပါ။ ဝန်ထမ်းများ အရောင်းပြုလုပ်ပြီးပါက ဤနေရာတွင် ပေါ်လာမည်။",
    salesChannelSplit: "အရောင်းလမ်းကြောင်း: ဆိုင်နှင့် အွန်လိုင်း",
    salesChannelSplitHint:
      "ဝင်ငွေ မည်သည့်လမ်းကြောင်းမှ လာသည်။ အစက်မျဉ်းသည် အွန်လိုင်းအချိုး။",
    salesChannelSplitFootnote:
      "အွန်လိုင်းတွင် COD နှင့် QR ပေးချေမှုအပါအဝင် ဝဘ်ဆိုင်မှ မှာယူမှုများ ပါဝင်သည်။ အက်ပ်နှစ်ခုသည် ဒေတာဘေ့စ် တူညီသဖြင့် ပြန်လည်ချိန်ညှိရန် မလိုပါ။",
    inStoreSales: "ဆိုင်တွင်း",
    onlineSales: "အွန်လိုင်း",
    onlineShare: "အွန်လိုင်းအချိုး",

    // Membership / loyalty economics
    membershipProfitability: "အသင်းဝင် အမြတ်အစွန်း",
    membershipProfitabilityHint:
      "အသင်းဝင်များ တစ်ခေါက်လျှင် မည်မှုတန်သည်၊ လျှော့ငွေပေးပြီးနောက် ဆက်လက်သာလွန်နေသလား။",
    membershipProfitabilityFootnote:
      "ဤအချက်သည် နှိုင်းယှဉ်မှုသာဖြစ်ပြီး အကြောင်းရင်းကို သက်သေမပြပါ။ မကြာခဏဝယ်သူများသာ အသင်းဝင်လေ့ရှိသဖြင့် အစီအစဉ်မရှိလည်း အသင်းဝင်များ ပိုအသုံးစွဲမည်။ ဝယ်ယူမှုသည် ထိုဖောက်သည်၏ အသင်းဝင်ရက်နောက်ပိုင်းဖြစ်မှသာ အသင်းဝင်အရောင်းအဖြစ် သတ်မှတ်သည်။ အသင်းမဝင်သူများတွင် လျှော့ငွေစရိတ်မရှိသဖြင့် စုစုပေါင်းနှင့် အသားတင် တူညီသည်။",
    members: "အသင်းဝင်များ",
    nonMembers: "အသင်းမဝင်သူများ",
    ordersPerCustomer: "ဖောက်သည်တစ်ဦးလျှင် မှာယူမှု",
    loyaltyCost: "အသင်းဝင်စရိတ်",
    netProfitAfterLoyalty: "အသင်းဝင်စရိတ်ပြီးနောက် အသားတင်အမြတ်",
    grossMarginRate: "စုစုပေါင်းအမြတ် %",
    basketUplift: "ဝယ်ယူမှုတိုးတက်မှု",
    walkInExcludedNotice:
      "ဖောက်သည်မသတ်မှတ်ရသော အရောင်း {count} ခု ({value}) ကို အသင်းဝင်/အသင်းမဝင် ခွဲခြား၍မရပါ။ အသင်းမဝင်အဖြစ် မှတ်မယူဘဲ နှစ်ဖက်မှ ချန်လှပ်ထားသည်။",
    noMembershipData: "ဤကာလအတွင်း ဖောက်သည်သတ်မှတ်ထားသော အရောင်းမရှိပါ",
    loyaltyCostTrend: "အသင်းဝင်စရိတ်နှင့် အသင်းဝင်ဝင်ငွေ",
    loyaltyCostTrendHint:
      "အစီအစဉ်မှ ပေးလိုက်သောပမာဏနှင့် ရရှိသော အသင်းဝင်ဝင်ငွေ။ အစက်မျဉ်းသည် စရိတ်နှုန်း။",
    loyaltyCostTrendFootnote:
      "စရိတ်သည် ဆိုင်တွင်းနှင့် အွန်လိုင်းမှ အမှန်တကယ်အသုံးပြုသော ကူပွန်ပမာဏဖြစ်သည်။ အသင်းဝင်အစီအစဉ်များကို ပုံမှန်အားဖြင့် ဝင်ငွေ၏ ရာခိုင်နှုန်းအနည်းငယ်ဖြင့် လည်ပတ်သည်။ သတ်မှတ်မျဉ်းအထက်ဆိုပါက ဆုလာဘ်အဆင့်များ ရက်ရောလွန်းနေသည်။",
    loyaltyCostRate: "စရိတ်နှုန်း",
    memberRevenue: "အသင်းဝင်ဝင်ငွေ",
    noLoyaltyActivity: "အသင်းဝင်လုပ်ဆောင်ချက် မရှိသေးပါ",
    loyaltyLiability: "အမှတ်ပေးရန်တာဝန်နှင့် အသုံးမပြုမှု",
    loyaltyLiabilityHint:
      "အသုံးမပြုသေးသော အမှတ်များသည် ပေးရန်ကတိပြုထားသော လျှော့ငွေဖြစ်သည်။ သက်တမ်းကုန်ကူပွန်များသည် မည်သူမျှမလိုလားသော ဆုလာဘ်များ။",
    loyaltyLiabilityFootnote:
      "တာဝန်ပမာဏကို အနည်းဆုံးအဆင့် ဆုလာဘ်နှုန်းဖြင့် တွက်ချက်သည် — ဖောက်သည်ရွေးနိုင်သည့် အသက်သာဆုံးအခြေအနေ။ ရာခိုင်နှုန်းဆုလာဘ်များသည် ဝယ်ယူမှုနှင့် တွဲမှသာ တန်ဖိုးရှိသဖြင့် ပျမ်းမျှဝယ်ယူမှုမှ ခန့်မှန်းသည်။ သက်တမ်းကုန်စစ်ဆေးမှုကို တစ်ဦးချင်းသာ လုပ်ဆောင်သဖြင့် ကူပွန်အခြေအနေကို သက်တမ်းရက်မှ ပြန်တွက်သည်။",
    pointsOutstanding: "လက်ကျန်အမှတ်",
    pointsEarnedLifetime: "စုစုပေါင်းရရှိအမှတ်",
    estimatedLiability: "ခန့်မှန်းတာဝန်ပမာဏ",
    rewardsRedeemable: "ဆုလာဘ် လဲလှယ်နိုင်",
    estimated: "ခန့်မှန်း",
    redemptionRate: "လဲလှယ်မှုနှုန်း",
    breakageRate: "အသုံးမပြုမှု",
    coupons: "ကူပွန်",
    couponsIssued: "ထုတ်ပေးပြီး",
    couponsUsed: "အသုံးပြုပြီး",
    couponsActive: "အသုံးပြုနိုင်",
    couponsExpired: "သက်တမ်းကုန်",

    // Transactions
    totalTransactions: "စုစုပေါင်းငွေလွှဲပြောင်းမှုများ",
    allStatus: "အခြေအနေအားလုံး",
    partiallyRefunded: "တစ်စိတ်တစ်ပိုင်းပြန်အမ်းမှုများ",
    allPaymentMethods: "ငွေပေးချေနည်းအားလုံး",
    allTime: "အချိန်မှုအားလုံး",
    searchTransactions: "ငွေလွှဲရှာဖွေရန်...",

    // Reports
    remainingStockValueUnit: "ကျန်ရှိစတော့တန်ဖိုး (ယူနစ်စျေးနှုန်း)",
    remainingStockValueOriginal: "ကျန်ရှိစတော့တန်ဖိုး (မူလစျေးနှုန်း)",
    totalNetProfit: "စုစုပေါင်းသန့်အမြတ်",
    avgTransactionValue: "ပျမ်းမျှငွေလွှဲတန်ဖိုး",
    dailyStatus: "နေ့စဉ်အခြေအနေ",

    // Payments
    successfulPayments: "အောင်မြင်သောငွေပေးချေမှုများ",
    cancelledPayments: "ပယ်ဖျက်ထားသောငွေပေးချေမှုများ",
    paymentMethodsBreakdown: "ငွေပေးချေနည်းဖြန့်ဝေမှု",
    cashPayments: "ငွေသားပေးချေမှုများ",
    scanPayments: "စကန်နန်ပေးချေမှုများ",
    walletPayments: "ပိုက်ဆံအိတ်ပေးချေမှုများ",
    codPayments: "ပေးပို့သောအခါပေးချေမှုများ",
    transaction: "ငွေလွှဲ",
    amount: "ပမာဏ",
    noPaymentsFound: "ငွေပေးချေမှုမတွေ့ပါ",
    sellingCurrency: "ရောင်းချသောငွေကြေး",
    walkInCustomer: "အလည်လာသူဖောက်သည်",
    rate: "နှုန်း",
    rowsPerPage: "စာမျက်နှာတစ်ခုလျှင်အတန်းအရေအတွက်",
    showingPayments: "{start}–{end} မှ {total} ငွေပေးချေမှုများ",
    showingTransactions: "{start}–{end} မှ {total} ငွေလွှဲပြောင်းမှုများ",
    units: "ယူနစ်",
    quantitySold: "ရောင်းချထားသောအရေအတွက်",
    totalSale: "စုစုပေါင်းရောင်းချမှု",
    performance: "စွမ်းဆောင်ရည်",
    soldBy: "ရောင်းချသူ",
    dateTime: "ရက်စွဲနှင့်အချိန်",
    netSales: "သန့်ရောင်းချမှု",
    types: "အမျိုးအစား",

    // Auth
    login: "ဝင်ရောက်ရန်",
    email: "အီးမေးလ်",
    password: "လျှို့ဝှက်နံပါတ်",
    forgotPassword: "လျှို့ဝှက်နံပါတ်မေ့သွားသည်",
    rememberMe: "ကျွန်ုပ်ကိုသတိရပါ",
    signIn: "ဝင်ရောက်ရန်",
    signOut: "ထွက်ရန်",

    // Validation messages
    fieldRequired: "ဤအကွက်လိုအပ်သည်",
    invalidEmail: "မှားယွင်းသောအီးမေးလ်လိပ်စာ",
    invalidPhone: "မှားယွင်းသောဖုန်းနံပါတ်",
    invalidAmount: "မှားယွင်းသောပမာဏ",
    confirmDelete: "ဖျက်ခြင်းကိုအတည်ပြုရန်",
    deleteConfirmMessage: "ဤပစ္စည်းကိုဖျက်ရန်သေချာပါသလား?",
    cannotBeUndone: "ဤလုပ်ဆောင်ချက်ကိုပြန်ပြင်၍မရနိုင်ပါ",

    // Days and Months
    monday: "တနင်္လာ",
    tuesday: "အင်္ဂါ",
    wednesday: "ဗုဒ္ဓဟူး",
    thursday: "ကြာသပတေး",
    friday: "သောကြာ",
    saturday: "စနေ",
    sunday: "တနင်္ဂနွေ",
    january: "ဇန်န၀ါရီ",
    february: "ဖေဖော်၀ါရီ",
    march: "မတ်",
    april: "ဧပြီ",
    may: "မေ",
    june: "ဇွန်",
    july: "ဇူလိုင်",
    august: "သြဂုတ်",
    september: "စက်တင်ဘာ",
    october: "အောက်တိုဘာ",
    november: "နိုဝင်ဘာ",
    december: "ဒီဇင်ဘာ",

    // Additional common phrases
    selectOption: "ရွေးချယ်ရန်",
    chooseFile: "ဖိုင်ရွေးရန်",
    dragDropFile: "ဖိုင်ကိုဤနေရာတွင်ဆွဲပစ်ပါ",
    uploadSuccess: "တင်ခြင်းအောင်မြင်",
    uploadFailed: "တင်ခြင်းမအောင်မြင်",
    processingPleaseWait: "လုပ်ဆောင်နေသည်၊ ကျေးဇူးပြု၍စောင့်ပါ...",
    saved: "သိမ်းဆည်းပြီးပါပြီ",
    deleted: "ဖျက်ပြီးပါပြီ",
    updated: "မွမ်းမံပြီးပါပြီ",
    created: "ဖန်တီးပြီးပါပြီ",
    branch: "ဘရန်ခ်ျ",
    wholesaleTier: "လက်ကားအဆင့်",
    minQuantity: "အနည်းဆုံးအရေအတွက်",
    pricePerUnit: "တစ်ယူနစ်လျှင်စျေးနှုန်း",
    tier: "အဆင့်",
    payNow: "ယခုပေးရန်",
    totalItems: "စုစုပေါင်းပစ္စည်းများ",
    grandTotal: "စုစုပေါင်းစျေးနှုန်း",
    selectCustomer: "ဖောက်သည်ရွေးရန်",
    newCustomer: "ဖောက်သည်အသစ်",
    phone: "ဖုန်း",
    address: "လိပ်စာ",
    receipt: "ငွေပြေစာ",
    receiptNumber: "ငွေပြေစာနံပါတ်",
    cashier: "ငွေကောင်တာ",
    paymentReceived: "ငွေပေးချေမှုလက်ခံရရှိ",
    thankYou: "ကျေးဇူးတင်ပါသည်",
    visitAgain: "ထပ်မံလာရောက်ပါရန်ဖိတ်ခေါ်ပါသည်!",
    itemsInCart: "ဈေးခြင်းထဲရှိပစ္စည်းများ",
    productsSearch: "ကုန်ပစ္စည်းရှာဖွေရန်...",
    filterByCategory: "အမျိုးအစားအလိုက်စစ်ထုတ်ရန်",
    filterByBrand: "ကုန်အမှတ်တံဆိပ်အလိုက်စစ်ထုတ်ရန်",
    clearFilters: "စစ်ထုတ်မှုများရှင်းလင်းရန်",
    allCategories: "အမျိုးအစားအားလုံး",
    allBrands: "ကုန်အမှတ်တံဆိပ်အားလုံး",
    sortBy: "စီရန်",
    priceHighToLow: "စျေးနှုန်း: မြင့်မှနိမ့်",
    priceLowToHigh: "စျေးနှုန်း: နိမ့်မှမြင့်",
    nameAToZ: "အမည်: A မှ Z",
    nameZToA: "အမည်: Z မှ A",
    newProduct: "ကုန်ပစ္စည်းအသစ်",
    wholeSale: "လက်ကား",
    retail: "လက်လီ",
    mixed: "ရောစပ်",
    viewDetails: "အသေးစိတ်ကြည့်ရန်",
    quickView: "မြန်မြန်ကြည့်ရန်",
    stockAvailable: "စတော့ရှိသည်",
    addToCartNow: "ဈေးခြင်းထဲထည့်ရန်",
    updateProduct: "ကုန်ပစ္စည်းမွမ်းမံရန်",
    deleteProduct: "ကုန်ပစ္စည်းဖျက်ရန်",
    confirmDeleteProduct: "ကုန်ပစ္စည်းဖျက်ခြင်းကိုအတည်ပြုရန်",
    active: "အသုံးပြုနေသော",
    inactive: "အသုံးမပြုသော",
    unit: "ယူနစ်",
    piece: "ခု",
    productCode: "ကုန်ပစ္စည်းကုတ်",
    supplier: "ကုန်သွင်းသူ",
    purchaseDate: "ဝယ်ယူသည့်ရက်စွဲ",
    expiryDate: "သက်တမ်းကုန်ဆုံးရက်",
    notes: "မှတ်စုများ",
    taxIncluded: "အခွန်ပါဝင်",
    taxExcluded: "အခွန်မပါ",
    inclusive: "အပါအဝင်",
    exclusive: "မပါဘဲ",
    cashPayment: "ငွေသားပေးချေမှု",
    cardPayment: "ကတ်ပေးချေမှု",
    mobilePayment: "မိုဘိုင်းပေးချေမှု",
    creditPayment: "ခရက်ဒစ်ပေးချေမှု",
    refundTransaction: "ငွေပြန်အမ်းခြင်း",
    voidTransaction: "ငွေလွှဲပယ်ဖျက်ခြင်း",
    duplicateReceipt: "ငွေပြေစာမိတ္တူ",
    emailReceipt: "အီးမေးလ်ငွေပြေစာ",
    smsReceipt: "SMS ငွေပြေစာ",
    printInvoice: "ဘောက်ချာပုံနှိပ်ရန်",
    downloadPdf: "PDF ဒေါင်းလုဒ်ရန်",
    exportExcel: "Excel ထုတ်ယူရန်",
    exportCsv: "CSV ထုတ်ယူရန်",
    importData: "ဒေတာတင်သွင်းရန်",
    bulkUpload: "အစုလိုက်တင်ရန်",
    template: "နမူနာ",
    downloadTemplate: "နမူနာဒေါင်းလုဒ်ရန်",
    uploadFile: "ဖိုင်တင်ရန်",
    validateData: "ဒေတာစစ်ဆေးရန်",
    totalRecords: "စုစုပေါင်းမှတ်တမ်းများ",
    successfulImports: "အောင်မြင်သောတင်သွင်းမှုများ",
    failedImports: "မအောင်မြင်သောတင်သွင်းမှုများ",
    viewErrors: "အမှားများကြည့်ရန်",
    retry: "ထပ်စမ်းကြည့်ရန်",
    back: "နောက်သို့",
    forward: "ရှေ့သို့",
    refresh: "ပြန်လည်ပြုပြင်ရန်",
    reload: "ပြန်တင်ရန်",
    help: "အကူအညီ",
    support: "ပံ့ပိုးကူညီမှု",
    documentation: "စာရွက်စာတမ်းများ",
    version: "ဗားရှင်း",
    aboutUs: "ကျွန်ုပ်တို့အကြောင်း",
    contactUs: "ကျွန်ုပ်တို့ကိုဆက်သွယ်ရန်",
    privacyPolicy: "ကိုယ်ရေးကိုယ်တာမူဝါဒ",
    termsOfService: "ဝန်ဆောင်မှုစည်းမျဉ်းများ",
    account: "အကောင့်",
    profile: "ကိုယ်ရေးအချက်အလက်",
    changePassword: "လျှို့ဝှက်နံပါတ်ပြောင်းရန်",
    updateProfile: "ကိုယ်ရေးအချက်အလက်မွမ်းမံရန်",
    profileSettings: "ကိုယ်ရေးအချက်အလက်ဆက်တင်များ",
    accountSettings: "အကောင့်ဆက်တင်များ",
    securitySettings: "လုံခြုံရေးဆက်တင်များ",
    twoFactorAuth: "နှစ်ဆင့်အတည်ပြုခြင်း",
    sessionManagement: "အချိန်စီမံခန့်ခွဲမှု",
    loginHistory: "ဝင်ရောက်မှုမှတ်တမ်း",
    deviceManagement: "စက်ပစ္စည်းစီမံခန့်ခွဲမှု",
    backup: "အရံသိမ်းဆည်းရန်",
    restore: "ပြန်လည်ရယူရန်",
    dataExport: "ဒေတာထုတ်ယူရန်",
    dataImport: "ဒေတာတင်သွင်းရန်",
    systemLogs: "စနစ်မှတ်တမ်းများ",
    auditTrail: "စစ်ဆေးမှုလမ်းကြောင်း",
    userActivity: "အသုံးပြုသူလုပ်ဆောင်ချက်",
    lastUpdated: "နောက်ဆုံးမွမ်းမံသည့်အချိန်",
    createdBy: "ဖန်တီးသူ",
    modifiedBy: "ပြင်ဆင်သူ",
    createdAt: "ဖန်တီးသည့်အချိန်",
    updatedAt: "မွမ်းမံသည့်အချိန်",
    deletedAt: "ဖျက်သည့်အချိန်",
  },
};
