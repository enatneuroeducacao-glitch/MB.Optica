import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const customers=await db.customer.findMany({
      where:{active:true},
      select:{id:true,name:true,cpfCnpj:true,phone:true,whatsapp:true,email:true}
    });
    const normalize=(v:string|null|undefined)=>v?String(v).replace(/\D/g,""):null;
    const groups=new Map<string,any[]>();
    for(const c of customers){
      const keys:[string,string|null][]=[
        ["CPF/CNPJ",normalize(c.cpfCnpj)],
        ["Telefone",normalize(c.phone)],
        ["WhatsApp",normalize(c.whatsapp)],
        ["E-mail",c.email?c.email.trim().toLowerCase():null]
      ];
      for(const [field,value] of keys){
        if(value && value.length>=8){
          const key=`${field}:${value}`;
          const list=groups.get(key)||[];
          list.push(c);
          groups.set(key,list);
        }
      }
    }
    const result=[...groups.entries()]
      .filter(([,list])=>list.length>1)
      .map(([key,list])=>({key,customers:list}));
    return NextResponse.json(result);
  }catch(error){
    return apiError(error,"Não foi possível verificar duplicidades.");
  }
}