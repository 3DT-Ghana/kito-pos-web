import { PrismaClient, Role, TenantStatus } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Database Seed Script
 *
 * Creates test data for development:
 * - 2 Tenants (Tenant A & Tenant B)
 * - 4 Users (2 per tenant: 1 OWNER, 1 STAFF)
 * - Sample manufacturers, items, customers, suppliers per tenant
 *
 * Run with: npx prisma db seed
 * Or manually: npx tsx prisma/seed.ts
 */

async function main() {
  console.log('🌱 Starting database seed...\n')

  // Clear existing data (in development only!)
  if (process.env.NODE_ENV === 'development') {
    console.log('🗑️  Clearing existing data...')
    await prisma.platformAuditLog.deleteMany()
    await prisma.platformAdmin.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.stockAdjustment.deleteMany()
    await prisma.supplierReturn.deleteMany()
    await prisma.customerReturn.deleteMany()
    await prisma.supplierPayment.deleteMany()
    await prisma.customerPayment.deleteMany()
    await prisma.stockTransferItem.deleteMany()
    await prisma.stockTransfer.deleteMany()
    await prisma.purchaseItem.deleteMany()
    await prisma.purchase.deleteMany()
    await prisma.saleItem.deleteMany()
    await prisma.sale.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.item.deleteMany()
    await prisma.manufacturer.deleteMany()
    await prisma.user.deleteMany()
    await prisma.tenant.deleteMany()
    console.log('✅ Cleared existing data\n')
  }

  // Hash password (same for all test users: "password123")
  const hashedPassword = await hash('password123', 10)

  console.log('🛡️  Creating default platform admin...')
  const platformAdmin = await prisma.platformAdmin.create({
    data: {
      name: 'Platform Admin',
      email: 'platform.admin@example.com',
      passwordHash: hashedPassword,
    },
  })
  console.log(`   Created platform admin: ${platformAdmin.email}`)

  // ========================================
  // TENANT A: "Market Store A"
  // ========================================
  console.log('🏢 Creating Tenant A...')
  const tenantA = await prisma.tenant.create({
    data: {
      name: 'Market Store A',
      phone: '+234-800-1111-111',
      status: TenantStatus.ACTIVE,
    },
  })
  console.log(`   Created: ${tenantA.name} (${tenantA.id})`)

  // Users for Tenant A
  console.log('👥 Creating users for Tenant A...')
  const ownerA = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      name: 'Alice Johnson',
      email: 'alice@tenanta.com',
      password: hashedPassword,
      role: Role.OWNER,
    },
  })
  console.log(`   Created OWNER: ${ownerA.email}`)

  const staffA = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      name: 'Bob Smith',
      email: 'bob@tenanta.com',
      password: hashedPassword,
      role: Role.STAFF,
    },
  })
  console.log(`   Created STAFF: ${staffA.email}`)

  // Manufacturers for Tenant A
  console.log('🏭 Creating manufacturers for Tenant A...')
  const manufacturerA1 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'Coca-Cola Company',
    },
  })
  const manufacturerA2 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'Nestle Nigeria',
    },
  })
  const manufacturerA3 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'Unilever Nigeria',
    },
  })
  const manufacturerA4 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'PZ Cussons',
    },
  })
  const manufacturerA5 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'Cadbury Nigeria',
    },
  })
  const manufacturerA6 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantA.id,
      name: 'Dano Milk',
    },
  })
  console.log(`   Created 6 manufacturers`)

  // Items for Tenant A (Comprehensive inventory)
  console.log('📦 Creating items for Tenant A...')
  await prisma.item.createMany({
    data: [
      // Beverages - Coca-Cola
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Coca-Cola 35cl', quantity: 150, costPrice: 70, sellingPrice: 100 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Coca-Cola 50cl', quantity: 120, costPrice: 80, sellingPrice: 120 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Coca-Cola 1L', quantity: 80, costPrice: 150, sellingPrice: 200 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Fanta 35cl', quantity: 100, costPrice: 65, sellingPrice: 95 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Fanta 50cl', quantity: 90, costPrice: 75, sellingPrice: 115 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Sprite 35cl', quantity: 95, costPrice: 65, sellingPrice: 95 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Sprite 50cl', quantity: 85, costPrice: 75, sellingPrice: 115 },

      // Food - Nestle
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Milo 400g', quantity: 60, costPrice: 1000, sellingPrice: 1300 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Milo 900g', quantity: 40, costPrice: 2200, sellingPrice: 2800 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Maggi Chicken 100 cubes', quantity: 75, costPrice: 800, sellingPrice: 1000 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Maggi Crayfish 100 cubes', quantity: 70, costPrice: 850, sellingPrice: 1050 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Golden Morn 500g', quantity: 50, costPrice: 950, sellingPrice: 1200 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Cerelac 400g', quantity: 35, costPrice: 1400, sellingPrice: 1700 },

      // Personal Care - Unilever
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Lux Soap 200g', quantity: 100, costPrice: 250, sellingPrice: 350 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Lifebuoy Soap 200g', quantity: 120, costPrice: 200, sellingPrice: 300 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Close Up Toothpaste 150ml', quantity: 80, costPrice: 500, sellingPrice: 700 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Sunlight Detergent 500g', quantity: 90, costPrice: 600, sellingPrice: 800 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Omo Detergent 900g', quantity: 70, costPrice: 1200, sellingPrice: 1500 },

      // Personal Care - PZ Cussons
      { tenantId: tenantA.id, manufacturerId: manufacturerA4.id, name: 'Imperial Leather Soap 200g', quantity: 85, costPrice: 300, sellingPrice: 450 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA4.id, name: 'Premier Cool Soap 200g', quantity: 95, costPrice: 180, sellingPrice: 280 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA4.id, name: 'Canoe Soap 200g', quantity: 110, costPrice: 150, sellingPrice: 250 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA4.id, name: 'Morning Fresh Dishwashing 400ml', quantity: 60, costPrice: 450, sellingPrice: 650 },

      // Food - Cadbury
      { tenantId: tenantA.id, manufacturerId: manufacturerA5.id, name: 'Bournvita 500g', quantity: 55, costPrice: 1100, sellingPrice: 1400 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA5.id, name: 'Bournvita 1kg', quantity: 30, costPrice: 2300, sellingPrice: 2900 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA5.id, name: 'Tom Tom Classic 50 pieces', quantity: 120, costPrice: 200, sellingPrice: 300 },

      // Dairy - Dano
      { tenantId: tenantA.id, manufacturerId: manufacturerA6.id, name: 'Dano Full Cream Milk 400g', quantity: 65, costPrice: 1000, sellingPrice: 1300 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA6.id, name: 'Dano Slim Milk 400g', quantity: 55, costPrice: 950, sellingPrice: 1250 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA6.id, name: 'Dano Cool Cow 180ml', quantity: 100, costPrice: 150, sellingPrice: 200 },

      // Low stock items (for testing alerts)
      { tenantId: tenantA.id, manufacturerId: manufacturerA1.id, name: 'Schweppes Tonic 35cl', quantity: 8, costPrice: 80, sellingPrice: 120 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA2.id, name: 'Nescafe Classic 100g', quantity: 5, costPrice: 1500, sellingPrice: 1900 },
      { tenantId: tenantA.id, manufacturerId: manufacturerA3.id, name: 'Dove Soap 100g', quantity: 3, costPrice: 400, sellingPrice: 600 },
    ],
  })
  console.log('   Created 30 items')

  // Customers for Tenant A
  console.log('👤 Creating customers for Tenant A...')
  await prisma.customer.createMany({
    data: [
      { tenantId: tenantA.id, name: 'John Doe', phone: '+234-803-123-4567', balance: 0 },
      { tenantId: tenantA.id, name: 'Jane Smith', phone: '+234-805-234-5678', balance: 5000 },
      { tenantId: tenantA.id, name: 'Michael Johnson', phone: '+234-807-345-6789', balance: 12500 },
      { tenantId: tenantA.id, name: 'Sarah Williams', phone: '+234-809-456-7890', balance: 0 },
      { tenantId: tenantA.id, name: 'David Brown', phone: '+234-810-567-8901', balance: 8300 },
      { tenantId: tenantA.id, name: 'Emma Davis', phone: '+234-812-678-9012', balance: 0 },
      { tenantId: tenantA.id, name: 'James Wilson', phone: '+234-813-789-0123', balance: 3200 },
      { tenantId: tenantA.id, name: 'Olivia Taylor', phone: '+234-814-890-1234', balance: 0 },
      { tenantId: tenantA.id, name: 'Robert Anderson', phone: '+234-815-901-2345', balance: 15700 },
      { tenantId: tenantA.id, name: 'Sophia Martinez', phone: '', balance: 0 }, // Walk-in customer
    ],
  })
  console.log('   Created 10 customers')

  // Suppliers for Tenant A
  console.log('🚚 Creating suppliers for Tenant A...')
  await prisma.supplier.createMany({
    data: [
      { tenantId: tenantA.id, name: 'Wholesale Distributors Ltd', phone: '+234-802-111-2222', balance: 0 },
      { tenantId: tenantA.id, name: 'Lagos Trade Center', phone: '+234-803-222-3333', balance: 45000 },
      { tenantId: tenantA.id, name: 'Beverage Suppliers Co', phone: '+234-804-333-4444', balance: 0 },
      { tenantId: tenantA.id, name: 'Food & Dairy Distributors', phone: '+234-805-444-5555', balance: 28500 },
      { tenantId: tenantA.id, name: 'Personal Care Wholesale', phone: '+234-806-555-6666', balance: 0 },
    ],
  })
  console.log('   Created 5 suppliers\n')

  // ========================================
  // TENANT B: "Market Store B"
  // ========================================
  console.log('🏢 Creating Tenant B...')
  const tenantB = await prisma.tenant.create({
    data: {
      name: 'Market Store B',
      phone: '+234-800-5555-555',
      status: TenantStatus.ACTIVE,
    },
  })
  console.log(`   Created: ${tenantB.name} (${tenantB.id})`)

  // Users for Tenant B
  console.log('👥 Creating users for Tenant B...')
  const ownerB = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      name: 'Charlie Brown',
      email: 'charlie@tenantb.com',
      password: hashedPassword,
      role: Role.OWNER,
    },
  })
  console.log(`   Created OWNER: ${ownerB.email}`)

  const staffB = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      name: 'Diana Prince',
      email: 'diana@tenantb.com',
      password: hashedPassword,
      role: Role.STAFF,
    },
  })
  console.log(`   Created STAFF: ${staffB.email}`)

  // Manufacturers for Tenant B
  console.log('🏭 Creating manufacturers for Tenant B...')
  const manufacturerB1 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantB.id,
      name: 'Dangote Group',
    },
  })
  const manufacturerB2 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantB.id,
      name: 'Golden Penny',
    },
  })
  const manufacturerB3 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantB.id,
      name: 'Honeywell Flour Mills',
    },
  })
  const manufacturerB4 = await prisma.manufacturer.create({
    data: {
      tenantId: tenantB.id,
      name: 'Chi Limited',
    },
  })
  console.log(`   Created 4 manufacturers`)

  // Items for Tenant B
  console.log('📦 Creating items for Tenant B...')
  await prisma.item.createMany({
    data: [
      // Dangote Products
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Sugar 500g', quantity: 180, costPrice: 350, sellingPrice: 450 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Sugar 1kg', quantity: 200, costPrice: 600, sellingPrice: 750 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Salt 250g', quantity: 200, costPrice: 60, sellingPrice: 100 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Salt 500g', quantity: 150, costPrice: 100, sellingPrice: 150 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Cement 50kg', quantity: 50, costPrice: 3500, sellingPrice: 4200 },

      // Golden Penny Products
      { tenantId: tenantB.id, manufacturerId: manufacturerB2.id, name: 'Golden Penny Semovita 1kg', quantity: 100, costPrice: 400, sellingPrice: 550 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB2.id, name: 'Golden Penny Flour 2kg', quantity: 80, costPrice: 900, sellingPrice: 1200 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB2.id, name: 'Golden Penny Spaghetti 500g', quantity: 120, costPrice: 300, sellingPrice: 400 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB2.id, name: 'Golden Penny Macaroni 500g', quantity: 110, costPrice: 320, sellingPrice: 420 },

      // Honeywell Products
      { tenantId: tenantB.id, manufacturerId: manufacturerB3.id, name: 'Honeywell Semovita 1kg', quantity: 90, costPrice: 420, sellingPrice: 570 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB3.id, name: 'Honeywell Wheat Flour 2kg', quantity: 75, costPrice: 950, sellingPrice: 1250 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB3.id, name: 'Honeywell Noodles 120g', quantity: 150, costPrice: 80, sellingPrice: 120 },

      // Chi Limited Products
      { tenantId: tenantB.id, manufacturerId: manufacturerB4.id, name: 'Chi Exotic 1L', quantity: 60, costPrice: 450, sellingPrice: 600 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB4.id, name: 'Chi Active Body 60cl', quantity: 80, costPrice: 200, sellingPrice: 300 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB4.id, name: 'Hollandia Yoghurt 315ml', quantity: 50, costPrice: 300, sellingPrice: 400 },

      // Low stock items
      { tenantId: tenantB.id, manufacturerId: manufacturerB1.id, name: 'Dangote Sugar 2kg', quantity: 7, costPrice: 1100, sellingPrice: 1400 },
      { tenantId: tenantB.id, manufacturerId: manufacturerB2.id, name: 'Golden Penny Noodles 120g', quantity: 9, costPrice: 75, sellingPrice: 110 },
    ],
  })
  console.log('   Created 17 items')

  // Customers for Tenant B
  console.log('👤 Creating customers for Tenant B...')
  await prisma.customer.createMany({
    data: [
      { tenantId: tenantB.id, name: 'Ibrahim Musa', phone: '+234-816-123-4567', balance: 0 },
      { tenantId: tenantB.id, name: 'Amina Hassan', phone: '+234-817-234-5678', balance: 7500 },
      { tenantId: tenantB.id, name: 'Chukwudi Okafor', phone: '+234-818-345-6789', balance: 0 },
      { tenantId: tenantB.id, name: 'Blessing Eze', phone: '+234-819-456-7890', balance: 4200 },
      { tenantId: tenantB.id, name: 'Tunde Adeyemi', phone: '+234-820-567-8901', balance: 0 },
      { tenantId: tenantB.id, name: 'Fatima Bello', phone: '', balance: 0 }, // Walk-in
    ],
  })
  console.log('   Created 6 customers')

  // Suppliers for Tenant B
  console.log('🚚 Creating suppliers for Tenant B...')
  await prisma.supplier.createMany({
    data: [
      { tenantId: tenantB.id, name: 'Kano Wholesale Market', phone: '+234-821-111-2222', balance: 0 },
      { tenantId: tenantB.id, name: 'Northern Distributors Ltd', phone: '+234-822-222-3333', balance: 32000 },
      { tenantId: tenantB.id, name: 'Food Stuff Suppliers', phone: '+234-823-333-4444', balance: 0 },
    ],
  })
  console.log('   Created 3 suppliers\n')

  // ========================================
  // SUMMARY
  // ========================================
  console.log('✅ Seed completed successfully!\n')
  console.log('📊 Summary:')
  console.log('═══════════════════════════════════════════════════════')
  console.log('🏢 TENANTS: 2')
  console.log('   • Market Store A (Lagos-based store)')
  console.log('   • Market Store B (Kano-based store)')
  console.log('')
  console.log('👥 USERS: 4 (Password: "password123" for all)')
  console.log('   ┌─ Tenant A (Market Store A):')
  console.log('   │  • alice@tenanta.com (OWNER)')
  console.log('   │  • bob@tenanta.com (STAFF)')
  console.log('   └─ Tenant B (Market Store B):')
  console.log('      • charlie@tenantb.com (OWNER)')
  console.log('      • diana@tenantb.com (STAFF)')
  console.log('')
  console.log('🏭 MANUFACTURERS:')
  console.log('   • Tenant A: 6 manufacturers')
  console.log('     (Coca-Cola, Nestle, Unilever, PZ Cussons, Cadbury, Dano)')
  console.log('   • Tenant B: 4 manufacturers')
  console.log('     (Dangote, Golden Penny, Honeywell, Chi Limited)')
  console.log('')
  console.log('📦 ITEMS:')
  console.log('   • Tenant A: 30 items')
  console.log('     - Beverages (7), Food (6), Personal Care (8), Dairy (3)')
  console.log('     - Low stock alerts: 3 items')
  console.log('   • Tenant B: 17 items')
  console.log('     - Food Staples (12), Beverages (3)')
  console.log('     - Low stock alerts: 2 items')
  console.log('')
  console.log('👤 CUSTOMERS:')
  console.log('   • Tenant A: 10 customers (6 with debt totaling ₦44,700)')
  console.log('   • Tenant B: 6 customers (2 with debt totaling ₦11,700)')
  console.log('')
  console.log('🚚 SUPPLIERS:')
  console.log('   • Tenant A: 5 suppliers (2 with credit totaling ₦73,500)')
  console.log('   • Tenant B: 3 suppliers (1 with credit of ₦32,000)')
  console.log('')
  console.log('🔒 SECURITY:')
  console.log('   ✓ Multi-tenant isolation enabled')
  console.log('   ✓ Bcrypt password hashing')
  console.log('   ✓ Role-based access control (OWNER/STAFF)')
  console.log('   ✓ Each tenant has completely separate data')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('🚀 NEXT STEPS:')
  console.log('   1. Run:   npm run dev')
  console.log('   2. Visit: http://localhost:3000/auth/login')
  console.log('   3. Login with any user above')
  console.log('   4. Test the multi-tenant system!')
  console.log('')
  console.log('💡 TIP: Login as alice@tenanta.com to see Tenant A data')
  console.log('         Login as charlie@tenantb.com to see Tenant B data')
  console.log('         Each will see completely different inventory!\n')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
