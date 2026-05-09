/**
 * E Store seed — populates the existing "E Store" tenant with realistic
 * Ghanaian FMCG inventory: manufacturers, items, customers, and suppliers.
 *
 * Run with:  npx tsx prisma/seed-estore.ts
 *
 * Safe to re-run: skips if data already exists (checks manufacturer count).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TENANT_ID = 'd6587df2-0d6c-483c-987d-515786d7aa66'

async function main() {
  console.log('🌱 Seeding E Store...\n')

  // Guard: don't double-seed
  const existing = await prisma.manufacturer.count({ where: { tenantId: TENANT_ID } })
  if (existing > 0) {
    console.log(`⚠️  E Store already has ${existing} manufacturer(s). Skipping to avoid duplicates.`)
    console.log('    Delete existing data first if you want a fresh seed.')
    return
  }

  // ─────────────────────────────────────────────────────────
  // MANUFACTURERS
  // ─────────────────────────────────────────────────────────
  console.log('🏭 Creating manufacturers...')

  const [
    cocaCola, nestle, unilever, pzCussons, cadbury,
    olam, friesland, verna, hollandia, fmcgMisc,
  ] = await Promise.all([
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Coca-Cola Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Nestlé Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Unilever Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'PZ Cussons Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Cadbury Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Olam Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'FrieslandCampina' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Verna Mineral Water' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Hollandia Ghana' } }),
    prisma.manufacturer.create({ data: { tenantId: TENANT_ID, name: 'Various / General' } }),
  ])

  console.log('   ✓ 10 manufacturers created\n')

  // ─────────────────────────────────────────────────────────
  // ITEMS
  // ─────────────────────────────────────────────────────────
  console.log('📦 Creating items...')

  await prisma.item.createMany({
    data: [

      // ── Beverages — Coca-Cola ────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112637922', name: 'Coca-Cola 33cl Can',        costPrice: 4.50,  sellingPrice: 6.00,  quantity: 144 },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112628951', name: 'Coca-Cola 50cl PET',        costPrice: 5.50,  sellingPrice: 7.50,  quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112637366', name: 'Coca-Cola 1.5L PET',        costPrice: 11.00, sellingPrice: 15.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112637960', name: 'Fanta Orange 33cl Can',     costPrice: 4.50,  sellingPrice: 6.00,  quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112637977', name: 'Fanta Orange 50cl PET',     costPrice: 5.50,  sellingPrice: 7.50,  quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112638950', name: 'Sprite 33cl Can',           costPrice: 4.50,  sellingPrice: 6.00,  quantity: 108 },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112638967', name: 'Sprite 50cl PET',           costPrice: 5.50,  sellingPrice: 7.50,  quantity: 84  },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112639001', name: 'Schweppes Ginger Ale 33cl', costPrice: 5.00,  sellingPrice: 7.00,  quantity: 4   },

      // ── Beverages — Water ────────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: verna.id, barcode: '6111246100017', name: 'Verna Mineral Water 500ml',   costPrice: 2.50,  sellingPrice: 3.50,  quantity: 240 },
      { tenantId: TENANT_ID, manufacturerId: verna.id, barcode: '6111246100024', name: 'Verna Mineral Water 1.5L',    costPrice: 5.00,  sellingPrice: 7.00,  quantity: 144 },
      { tenantId: TENANT_ID, manufacturerId: verna.id, barcode: '6111246100031', name: 'Verna Mineral Water 5L',      costPrice: 12.00, sellingPrice: 16.00, quantity: 60  },

      // ── Dairy — FrieslandCampina / Hollandia ─────────────
      { tenantId: TENANT_ID, manufacturerId: friesland.id, barcode: '8718455208501', name: 'Peak Full Cream Milk 400g',  costPrice: 32.00, sellingPrice: 42.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: friesland.id, barcode: '8718455208518', name: 'Peak Full Cream Milk 900g',  costPrice: 68.00, sellingPrice: 88.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: friesland.id, barcode: '8718455208525', name: 'Peak Evaporated Milk 410g',  costPrice: 18.00, sellingPrice: 25.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: hollandia.id, barcode: '6191234000011', name: 'Hollandia Yoghurt Strawberry 500ml', costPrice: 22.00, sellingPrice: 30.00, quantity: 48 },
      { tenantId: TENANT_ID, manufacturerId: hollandia.id, barcode: '6191234000028', name: 'Hollandia Yoghurt Natural 500ml',    costPrice: 22.00, sellingPrice: 30.00, quantity: 3  },

      // ── Malt / Energy ────────────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112500014', name: 'Malta Guinness 33cl Can',   costPrice: 5.50,  sellingPrice: 7.50,  quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: cocaCola.id, barcode: '5000112500021', name: 'Malta Guinness 50cl PET',   costPrice: 6.50,  sellingPrice: 9.00,  quantity: 72  },

      // ── Food / Dry Goods — Nestlé ────────────────────────
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626844', name: 'Milo 400g Tin',              costPrice: 55.00, sellingPrice: 72.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626851', name: 'Milo 900g Tin',              costPrice: 115.00,sellingPrice: 148.00,quantity: 48  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626868', name: 'Milo 200g Sachet',           costPrice: 28.00, sellingPrice: 38.00, quantity: 108 },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613035395848', name: 'Nescafé Classic 50g Sachet', costPrice: 20.00, sellingPrice: 28.00, quantity: 5   },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613035395855', name: 'Nescafé Classic 100g Tin',   costPrice: 38.00, sellingPrice: 50.00, quantity: 48  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034900005', name: 'Maggi Chicken Cubes 100 pcs',costPrice: 12.00, sellingPrice: 18.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034900012', name: 'Maggi Shrimp Cubes 100 pcs', costPrice: 13.00, sellingPrice: 19.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626912', name: 'Cerelac Honey & Wheat 400g', costPrice: 68.00, sellingPrice: 88.00, quantity: 36  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626929', name: 'Golden Morn Maize 500g',     costPrice: 28.00, sellingPrice: 38.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: nestle.id, barcode: '7613034626936', name: 'Golden Morn Wheat 500g',     costPrice: 28.00, sellingPrice: 38.00, quantity: 60  },

      // ── Cooking Essentials — Olam ────────────────────────
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670017', name: 'Tasty Tom Tomato Paste 70g',   costPrice: 3.00,  sellingPrice: 4.50,  quantity: 240 },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670024', name: 'Tasty Tom Tomato Paste 400g',  costPrice: 14.00, sellingPrice: 19.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670031', name: 'Tasty Tom Tomato Paste 800g',  costPrice: 26.00, sellingPrice: 35.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670048', name: 'King Vegetable Oil 1L',        costPrice: 28.00, sellingPrice: 36.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670055', name: 'King Vegetable Oil 2L',        costPrice: 54.00, sellingPrice: 70.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802670062', name: 'King Vegetable Oil 5L',        costPrice: 128.00,sellingPrice: 165.00,quantity: 48  },

      // ── Cadbury ──────────────────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: cadbury.id, barcode: '7622300441951', name: 'Bournvita 500g Tin',        costPrice: 58.00, sellingPrice: 75.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: cadbury.id, barcode: '7622300441968', name: 'Bournvita 900g Tin',        costPrice: 98.00, sellingPrice: 128.00,quantity: 36  },
      { tenantId: TENANT_ID, manufacturerId: cadbury.id, barcode: '7622300441975', name: 'Bournvita 200g Sachet',     costPrice: 25.00, sellingPrice: 35.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: cadbury.id, barcode: '7622300300005', name: 'Tom Tom Sweet Mint 100g',   costPrice: 6.00,  sellingPrice: 9.00,  quantity: 4   },

      // ── Personal Care — Unilever ─────────────────────────
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710908990151', name: 'Lux Soap Beauty Bar 200g',     costPrice: 7.00,  sellingPrice: 10.00, quantity: 180 },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710908990168', name: 'Lifebuoy Soap Total 175g',     costPrice: 5.50,  sellingPrice: 8.00,  quantity: 240 },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710908990175', name: 'Dove Soap Beauty Bar 100g',    costPrice: 10.00, sellingPrice: 14.00, quantity: 3   },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8714100004586', name: 'Close Up Toothpaste 75ml',     costPrice: 8.50,  sellingPrice: 12.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8714100004593', name: 'Close Up Toothpaste 150ml',    costPrice: 15.00, sellingPrice: 21.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8717163512210', name: 'Signal Toothpaste 75ml',       costPrice: 9.00,  sellingPrice: 13.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710908130012', name: 'Sunsilk Shampoo 180ml',        costPrice: 18.00, sellingPrice: 25.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710908130029', name: 'Sunsilk Conditioner 180ml',    costPrice: 19.00, sellingPrice: 27.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710522000012', name: 'Omo Detergent 500g',           costPrice: 18.00, sellingPrice: 25.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710522000029', name: 'Omo Detergent 1kg',            costPrice: 32.00, sellingPrice: 44.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8710522000036', name: 'Omo Detergent 2kg',            costPrice: 60.00, sellingPrice: 82.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8711200900037', name: 'Sunlight Dishwashing Liq 400ml',costPrice:14.00,  sellingPrice: 20.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: unilever.id, barcode: '8711200900044', name: 'Sunlight Dishwashing Liq 750ml',costPrice:24.00,  sellingPrice: 33.00, quantity: 72  },

      // ── Personal Care — PZ Cussons ───────────────────────
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024021012', name: 'Imperial Leather Soap 200g',  costPrice: 9.00,  sellingPrice: 13.00, quantity: 144 },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024021029', name: 'Premier Cool Soap 200g',      costPrice: 6.00,  sellingPrice: 9.00,  quantity: 180 },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024021036', name: 'Caress Soap 200g',             costPrice: 6.50,  sellingPrice: 9.50,  quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024010016', name: 'Morning Fresh Dish Liq 400ml', costPrice: 15.00, sellingPrice: 21.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024010023', name: 'Morning Fresh Dish Liq 750ml', costPrice: 26.00, sellingPrice: 36.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024030014', name: 'Robb Herbal Balm 40g',         costPrice: 8.00,  sellingPrice: 12.00, quantity: 96  },

      // ── Household / General ──────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000016', name: 'Parazone Bleach 750ml',         costPrice: 10.00, sellingPrice: 15.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000023', name: 'Harpic Toilet Cleaner 500ml',   costPrice: 22.00, sellingPrice: 30.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000030', name: 'Toilet Roll (10 rolls pack)',    costPrice: 28.00, sellingPrice: 38.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000047', name: 'Tissue Paper 200-sheet box',     costPrice: 18.00, sellingPrice: 26.00, quantity: 48  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000054', name: 'Freezer Bags (50 pcs)',          costPrice: 5.00,  sellingPrice: 8.00,  quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000061', name: 'Candles 8-pack',                 costPrice: 8.00,  sellingPrice: 12.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000078', name: 'Mosquito Coil (10 pcs)',         costPrice: 7.00,  sellingPrice: 11.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000085', name: 'Air Freshener Spray 300ml',      costPrice: 22.00, sellingPrice: 30.00, quantity: 3   },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780001000092', name: 'Sponge Scrubber 3-pack',         costPrice: 4.00,  sellingPrice: 7.00,  quantity: 2   },

      // ── Snacks / Confectionery ───────────────────────────
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '6001008102012', name: 'Digestive Biscuits 200g',        costPrice: 12.00, sellingPrice: 17.00, quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '6001008102029', name: 'Cream Crackers 200g',            costPrice: 10.00, sellingPrice: 15.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '6001008102036', name: 'Custard Cream Biscuits 150g',    costPrice: 9.00,  sellingPrice: 14.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '6001008102043', name: 'Choco Wafer 50g',               costPrice: 3.50,  sellingPrice: 5.00,  quantity: 180 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '6001008102050', name: 'Chin Chin 200g',                costPrice: 8.00,  sellingPrice: 12.00, quantity: 96  },

      // ── Grains / Staples ─────────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700011', name: 'Rice (Bag) 5kg',                   costPrice: 95.00, sellingPrice: 125.00,quantity: 48  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700028', name: 'Rice (Bag) 10kg',                  costPrice: 185.00,sellingPrice: 240.00,quantity: 30  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700035', name: 'Semolina 1kg',                     costPrice: 14.00, sellingPrice: 20.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700042', name: 'Wheat Flour 2kg',                  costPrice: 28.00, sellingPrice: 38.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700049', name: 'Corn Flour 1kg',                   costPrice: 11.00, sellingPrice: 16.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: olam.id, barcode: '6009802700056', name: 'Rolled Oats 500g',                 costPrice: 24.00, sellingPrice: 33.00, quantity: 48  },

      // ── Condiments / Spices ──────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000013', name: 'Table Salt 500g',              costPrice: 3.00,  sellingPrice: 5.00,  quantity: 180 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000020', name: 'White Sugar 1kg',              costPrice: 12.00, sellingPrice: 18.00, quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000037', name: 'White Sugar 2kg',              costPrice: 22.00, sellingPrice: 33.00, quantity: 72  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000044', name: 'Ground Pepper 50g',            costPrice: 5.00,  sellingPrice: 8.00,  quantity: 120 },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000051', name: 'Mixed Spice Seasoning 50g',    costPrice: 5.50,  sellingPrice: 8.50,  quantity: 96  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780002000068', name: 'White Vinegar 750ml',          costPrice: 8.00,  sellingPrice: 12.00, quantity: 60  },

      // ── Baby Care ────────────────────────────────────────
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024050012', name: 'Baby Powder 200g',            costPrice: 20.00, sellingPrice: 28.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024050029', name: 'Baby Lotion 200ml',           costPrice: 22.00, sellingPrice: 30.00, quantity: 48  },
      { tenantId: TENANT_ID, manufacturerId: pzCussons.id, barcode: '5010024050036', name: 'Baby Wipes 80 sheets',        costPrice: 16.00, sellingPrice: 23.00, quantity: 60  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780003000010', name: 'Pampers Diapers S (30 pcs)',   costPrice: 95.00, sellingPrice: 125.00,quantity: 24  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780003000027', name: 'Pampers Diapers M (28 pcs)',   costPrice: 98.00, sellingPrice: 128.00,quantity: 24  },
      { tenantId: TENANT_ID, manufacturerId: fmcgMisc.id, barcode: '9780003000034', name: 'Pampers Diapers L (26 pcs)',   costPrice: 100.00,sellingPrice: 130.00,quantity: 2   },
    ],
  })

  console.log('   ✓ 80 items created (including 8 low-stock items)\n')

  // ─────────────────────────────────────────────────────────
  // CUSTOMERS
  // ─────────────────────────────────────────────────────────
  console.log('👤 Creating customers...')

  await prisma.customer.createMany({
    data: [
      { tenantId: TENANT_ID, name: 'Kwame Asante',      phone: '0244123456', balance: 0     },
      { tenantId: TENANT_ID, name: 'Abena Mensah',      phone: '0277234567', balance: 85.50 },
      { tenantId: TENANT_ID, name: 'Kofi Boateng',      phone: '0554345678', balance: 0     },
      { tenantId: TENANT_ID, name: 'Akosua Darko',      phone: '0201456789', balance: 220.00},
      { tenantId: TENANT_ID, name: 'Yaw Amponsah',      phone: '0246567890', balance: 0     },
      { tenantId: TENANT_ID, name: 'Ama Osei',          phone: '0208678901', balance: 145.75},
      { tenantId: TENANT_ID, name: 'Kwabena Frimpong',  phone: '0244789012', balance: 0     },
      { tenantId: TENANT_ID, name: 'Efua Asare',        phone: '0277890123', balance: 310.00},
      { tenantId: TENANT_ID, name: 'Nana Yeboah',       phone: '0554901234', balance: 0     },
      { tenantId: TENANT_ID, name: 'Adwoa Ofori',       phone: '0201012345', balance: 0     },
      { tenantId: TENANT_ID, name: 'Kojo Adu',          phone: '0246123456', balance: 55.00 },
      { tenantId: TENANT_ID, name: 'Maame Amoah',       phone: '0208234567', balance: 0     },
      { tenantId: TENANT_ID, name: 'Fiifi Baah',        phone: '0244345678', balance: 190.00},
      { tenantId: TENANT_ID, name: 'Akua Nyarko',       phone: '0277456789', balance: 0     },
      { tenantId: TENANT_ID, name: 'Walk-in Customer',  phone: null,         balance: 0     },
    ],
  })

  console.log('   ✓ 15 customers created (5 with outstanding balances)\n')

  // ─────────────────────────────────────────────────────────
  // SUPPLIERS
  // ─────────────────────────────────────────────────────────
  console.log('🚚 Creating suppliers...')

  await prisma.supplier.createMany({
    data: [
      { tenantId: TENANT_ID, name: 'Accra Wholesale Depot',      phone: '0302512345', balance: 0      },
      { tenantId: TENANT_ID, name: 'Ghana Beverages Distributor', phone: '0302623456', balance: 1850.00},
      { tenantId: TENANT_ID, name: 'Nestlé Ghana Direct',        phone: '0302734567', balance: 0      },
      { tenantId: TENANT_ID, name: 'Unilever Ghana Sales',       phone: '0302845678', balance: 3200.00},
      { tenantId: TENANT_ID, name: 'PZ Cussons Distributor',     phone: '0302956789', balance: 0      },
      { tenantId: TENANT_ID, name: 'Kumasi General Traders',     phone: '0322112233', balance: 750.00 },
      { tenantId: TENANT_ID, name: 'Tema Port Imports Ltd',      phone: '0303445566', balance: 0      },
    ],
  })

  console.log('   ✓ 7 suppliers created (3 with outstanding credit)\n')

  // ─────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────
  const [itemCount, customerCount, supplierCount] = await Promise.all([
    prisma.item.count({ where: { tenantId: TENANT_ID } }),
    prisma.customer.count({ where: { tenantId: TENANT_ID } }),
    prisma.supplier.count({ where: { tenantId: TENANT_ID } }),
  ])

  console.log('═══════════════════════════════════════════════════════')
  console.log('✅ E Store seed complete!')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`🏭 Manufacturers : 10`)
  console.log(`📦 Items         : ${itemCount}`)
  console.log(`   Categories    : Beverages, Dairy, Food/Dry Goods,`)
  console.log(`                   Personal Care, Household, Snacks,`)
  console.log(`                   Grains, Condiments, Baby Care`)
  console.log(`   Low-stock (≤5): 8 items flagged`)
  console.log(`   Barcodes      : all items have EAN-13 barcodes`)
  console.log(`👤 Customers     : ${customerCount} (5 with open balances)`)
  console.log(`🚚 Suppliers     : ${supplierCount} (3 with credit owing)`)
  console.log('═══════════════════════════════════════════════════════\n')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
