import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AIChat } from "@/components/chat/ai-chat";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lionalyze — Influencer Intelligence",
  description: "AI-powered Instagram influencer identification, classification, and scoring for male-focused niche clusters.",
  icons: {
    icon: [
      { url: '/lionalyze.ico', media: '(prefers-color-scheme: dark)' },
      { url: '/lionalyze-dark.ico', media: '(prefers-color-scheme: light)' },
    ],
    shortcut: '/lionalyze.ico',
    apple: '/lionalyze-light.png',
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <TooltipProvider>
          <AuthProvider>{children}</AuthProvider>
        </TooltipProvider>
        <AIChat />
      </body>
    </html>
  );
}
