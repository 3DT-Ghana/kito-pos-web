import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ESTORE_TENANT_ID = 'd6587df2-0d6c-483c-987d-515786d7aa66'

const CATEGORIES = [
  { name: 'Beverages',          color: '#3b82f6', icon: '🥤', sortOrder: 1 },
  { name: 'Water & Dairy',      color: '#06b6d4', icon: '🍼', sortOrder: 2 },
  { name: 'Snacks & Confection',color: '#f97316', icon: '🍫', sortOrder: 3 },
  { name: 'Food & Dry Goods',   color: '#eab308', icon: '🍚', sortOrder: 4 },
  { name: 'Grains & Staples',   color: '#a16207', icon: '🌾', sortOrder: 5 },
  { name: 'Cooking Essentials', color: '#22c55e', icon: '🧂', sortOrder: 6 },
  { name: 'Personal Care',      color: '#ec4899', icon: '🧴', sortOrder: 7 },
  { name: 'Household',          color: '#8b5cf6', icon: '🧹', sortOrder: 8 },
  { name: 'Baby Care',          color: '#f43f5e', icon: '👶', sortOrder: 9 },
  { name: 'Health & Wellness',  color: '#14b8a6', icon: '💊', sortOrder: 10 },
]

// Keywords that map item names to category names
const CATEGORY_MAP: { keywords: string[]; category: string }[] = [
  { keywords: ['coke','pepsi','fanta','sprite','malta','malt','alvaro','vimto','mirinda','supermalt','energy drink','red bull','lucozade','power drink','herbal','juice','sobolo','ribena','schweppes','coca-cola','nescafé','nescafe'], category: 'Beverages' },
  { keywords: ['water','voltic','spar ','evian','aqua','hollandia milk','milk','yoghurt','yogurt','nunu','fan ice','fanmilk','fan milk','clover'], category: 'Water & Dairy' },
  { keywords: ['biscuit','cake','chocolate','candy','sweet','lollipop','chewing gum','chips','crisp','pringles','digestive','digestives','wafer','toffee','snack'], category: 'Snacks & Confection' },
  { keywords: ['pasta','spaghetti','macaroni','noodle','indomie','sardine','tuna','corned beef','tom brown','oats','cereal','milo','cocoa','bournvita','ovaltine','horlicks','golden morn','chin chin'], category: 'Food & Dry Goods' },
  { keywords: ['rice','flour','yam','cassava','millet','sorghum','maize','corn','gari','gari biscuit','beans','groundnut','kenkey','peanut butter','semolina'], category: 'Grains & Staples' },
  { keywords: ['oil','vegetable oil','palm oil','salt','seasoning','maggi','knorr','spice','pepper','tomato','tomatoes','butter','margarine','sugar','honey','vinegar'], category: 'Cooking Essentials' },
  { keywords: ['soap','shampoo','lotion','cream','toothpaste','toothbrush','deodorant','hair','cologne','perfume','body spray','razor','pad','sanitary','cotton','tissue','toilet paper','wipes','sunsilk'], category: 'Personal Care' },
  { keywords: ['detergent','washing powder','surf','omo','ariel','sunlight','bleach','vim','domestos','air freshener','mosquito coil','insecticide','mop','broom','sponge','gloves','morning fresh','freezer bag','freezer bags','candle','candles'], category: 'Household' },
  { keywords: ['pampers','diapers','nappies','baby powder','baby lotion','baby soap','pap','cerelac','nan ','SMA ','formula'], category: 'Baby Care' },
  { keywords: ['paracetamol','vitamin','supplement','glucose','ors','oral rehydration','antiseptic','bandage','plaster','strepsils','cough','syrup'], category: 'Health & Wellness' },
]

function matchCategory(itemName: string): string | undefined {
  const lower = itemName.toLowerCase()
  for (const { keywords, category } of CATEGORY_MAP) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return category
  }
  return undefined
}

async function main() {
  console.log('Seeding categories for E Store...')

  // Create or update categories
  const createdCats: Record<string, string> = {}
  for (const cat of CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { tenantId: ESTORE_TENANT_ID, name: cat.name },
    })
    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data: cat })
      createdCats[cat.name] = existing.id
      console.log(`  Updated category: ${cat.name}`)
    } else {
      const created = await prisma.category.create({
        data: { ...cat, tenantId: ESTORE_TENANT_ID },
      })
      createdCats[cat.name] = created.id
      console.log(`  Created category: ${cat.name}`)
    }
  }

  // Assign categories to existing items
  const items = await prisma.item.findMany({
    where: { tenantId: ESTORE_TENANT_ID },
    select: { id: true, name: true },
  })

  let assigned = 0
  const unmatched: string[] = []

  for (const item of items) {
    const catName = matchCategory(item.name)
    if (catName && createdCats[catName]) {
      await prisma.item.update({
        where: { id: item.id },
        data: { categoryId: createdCats[catName] },
      })
      assigned++
    } else {
      unmatched.push(item.name)
    }
  }

  console.log(`\nAssigned ${assigned}/${items.length} items to categories.`)
  if (unmatched.length > 0) {
    console.log(`Unmatched items (${unmatched.length}):`)
    unmatched.forEach(n => console.log(`  - ${n}`))
  }
  console.log('\nDone!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
