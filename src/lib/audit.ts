import {Prisma} from "@prisma/client";
import {getCurrentUser} from "@/lib/auth";

type AuditInput={
  action:string;
  entity:string;
  entityId?:string;
  userId?:string;
  metadata?:Prisma.InputJsonValue;
};

export async function writeAudit(tx:Prisma.TransactionClient,input:AuditInput){
  const currentUser=input.userId?null:await getCurrentUser();
  const candidate=input.userId??currentUser?.id;
  const userId=candidate && candidate!=="test-admin" ? candidate : undefined;
  return tx.auditLog.create({
    data:{
      action:input.action,
      entity:input.entity,
      entityId:input.entityId,
      userId,
      metadata:input.metadata
    }
  });
}
