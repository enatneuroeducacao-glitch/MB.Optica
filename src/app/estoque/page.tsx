import {redirect} from "next/navigation";

export default function EstoqueRedirect(){
  redirect("/produtos?tab=estoque");
}
