import "./globals.css";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { enforceSubscriptionAccess } from "@/lib/subscription";

export const metadata={title:"MB Óptica | Gestão",description:"Sistema de gestão de óptica"};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const pathname=(await headers()).get("x-mb-pathname") ?? "/";
  const user=await getCurrentUser();
  const publicPage=pathname==="/inicio" || pathname==="/login" || pathname==="/setup" || pathname==="/acesso-negado" || pathname==="/primeiro-acesso";
  if(user && !publicPage){ try { await enforceSubscriptionAccess(); } catch(error) { if(error instanceof Error && (error.message==="SUBSCRIPTION_MODULE_LOCKED" || error.message==="SUBSCRIPTION_USER_LIMIT")) redirect("/acesso-negado"); throw error; } }
  return <html lang="pt-BR"><body><AppShell user={publicPage ? user : user}>{children}</AppShell></body></html>;
}