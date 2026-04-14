import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed the company_admin role — this is bootstrap/config data, not test data.
  // All other data (companies, cars, users) is created through application flows.
  await prisma.role.upsert({
    where: { name: 'company_admin' },
    update: {},
    create: {
      name: 'company_admin',
      description: 'Company administrator with full access',
    },
  });

  console.log('Seed complete: company_admin role created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
