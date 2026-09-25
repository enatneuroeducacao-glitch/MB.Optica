import "./globals.css";import {AppShell} from "@/components/AppShell";
export const metadata={title:"MB Óptica | Gestão",description:"Sistema de gestão de óptica"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body><AppShell>{children}</AppShell></body></html>}