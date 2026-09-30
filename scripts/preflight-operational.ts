import {PrismaClient} from "@prisma/client";

const db=new PrismaClient();

async function main(){
  if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const [customers,activeCustomers,products,activeProducts,suppliers,activeSuppliers,migrationRuns]=await Promise.all([
    db.customer.count(),
    db.customer.count({where:{active:true}}),
    db.product.count(),
    db.product.count({where:{active:true}}),
    db.supplier.count(),
    db.supplier.count({where:{active:true}}),
    db.migrationRun.count()
  ]);
  console.log(JSON.stringify({status:"OK",databaseConfigured:true,customers:{total:customers,active:activeCustomers},products:{total:products,active:activeProducts},suppliers:{total:suppliers,active:activeSuppliers},migrationRuns},null,2));
}

main().catch(error=>{
  console.error("PREFLIGHT_FAILED",error instanceof Error?error.message:error);
  process.exitCode=1;
}).finally(async()=>db.$disconnect());
