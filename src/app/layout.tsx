import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FocusFlow",
  description: "Personal task planner and notes for conversations",
  // Name and look when the page is added to the iPhone home screen or the Mac Dock.
  appleWebApp: { capable: true, title: "FocusFlow", statusBarStyle: "default" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
