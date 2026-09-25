import "./globals.css";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

export const metadata={title:"MB Óptica | Gestão",description:"Sistema de gestão de óptica"};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const pathname=(await headers()).get("x-mb-pathname") ?? "/";
  const user=await getCurrentUser();
  const publicPage=pathname==="/login" || pathname==="/setup" || pathname==="/acesso-negado";
  return <html lang="pt-BR"><body><AppShell user={publicPage ? user : user}>{children}</AppShell></body></html>;
}