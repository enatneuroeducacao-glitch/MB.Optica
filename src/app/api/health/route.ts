import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const started=Date.now();
  try{
    await db.$queryRaw`SELECT 1`;
    const [
      user,customer,address,prescription,category,supplier,product,stockLot,stockMovement,stockMovementLot,
      quote,quoteItem,order,orderItem,orderEvent,sale,saleItem,paymentMethod,payment,account,accountSettlement,
      cashSession,cashMovement,auditLog,legacyRecord,storeSettings,fiscalConfig,fiscalDocument
    ]=await Promise.all([
      db.user.count(),db.customer.count(),db.address.count(),db.prescription.count(),db.category.count(),db.supplier.count(),
      db.product.count(),db.stockLot.count(),db.stockMovement.count(),db.stockMovementLot.count(),db.quote.count(),
      db.quoteItem.count(),db.opticalOrder.count(),db.opticalOrderItem.count(),db.orderEvent.count(),db.sale.count(),
      db.saleItem.count(),db.paymentMethod.count(),db.payment.count(),db.account.count(),db.accountSettlement.count(),
      db.cashSession.count(),db.cashMovement.count(),db.auditLog.count(),db.legacyRecord.count(),db.storeSettings.count(),
      db.fiscalConfig.count(),db.fiscalDocument.count()
    ]);
    const tables={
      User:user,Customer:customer,Address:address,Prescription:prescription,Category:category,Supplier:supplier,
      Product:product,StockLot:stockLot,StockMovement:stockMovement,StockMovementLot:stockMovementLot,Quote:quote,
      QuoteItem:quoteItem,OpticalOrder:order,OpticalOrderItem:orderItem,OrderEvent:orderEvent,Sale:sale,SaleItem:saleItem,
      PaymentMethod:paymentMethod,Payment:payment,Account:account,AccountSettlement:accountSettlement,CashSession:cashSession,
      CashMovement:cashMovement,AuditLog:auditLog,LegacyRecord:legacyRecord,StoreSettings:storeSettings,
      FiscalConfig:fiscalConfig,FiscalDocument:fiscalDocument
    };
    return NextResponse.json({
      ok:true,service:"mb-optica",version:"0.3.0",database:"up",timestamp:new Date().toISOString(),
      latencyMs:Date.now()-started,checks:{database:"up",schema:"up",tables:"up"},
      tables,bootstrap:{initialized:user>0,settings:storeSettings>0}
    });
  }catch(error){
    return NextResponse.json({
      ok:false,service:"mb-optica",version:"0.3.0",database:"down",timestamp:new Date().toISOString(),
      latencyMs:Date.now()-started,checks:{database:"down",schema:"unknown",tables:"unknown"},
      detail:process.env.NODE_ENV==="development"?String(error):undefined
    },{status:503});
  }
}