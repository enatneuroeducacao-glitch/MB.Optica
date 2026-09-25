import {Prisma} from "@prisma/client";

type AuditInput={
  action:string;
  entity:string;
  entityId?:string;
  userId?:string;
  metadata?:Prisma.InputJsonValue;
};

export async function writeAudit(tx:Prisma.TransactionClient,input:AuditInput){
  return tx.auditLog.create({
    data:{
      action:input.action,
      entity:input.entity,
      entityId:input.entityId,
      userId:input.userId,
      metadata:input.metadata
    }
  });
}
