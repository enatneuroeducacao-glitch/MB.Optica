import {ORDER_STATUS_LABEL} from "@/lib/domain";

export function StatusBadge({status}:{status:keyof typeof ORDER_STATUS_LABEL}){
  return <span className={"status status-"+String(status).toLowerCase()}>{ORDER_STATUS_LABEL[status]}</span>;
}