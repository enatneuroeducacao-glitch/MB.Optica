import "./globals.css";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

export const metadata={title:"MB Óptica | Gestão",description:"Sistema de gestão de óptica"};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const pathname=(await headers()).get("x-mb-pathname") ?? "/";
  const publicPage=pathname==="/login" || pathname==="/setup";
  const user=await getCurrentUser();
  if(!publicPage && !user) redirect("/login");
  return <html lang="pt-BR"><body><AppShell user={user}>{children}</AppShell></body></html>;
}