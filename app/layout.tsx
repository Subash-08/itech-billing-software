import type { Metadata } from 'next';
import './globals.css';
import './workflows.css';
import './enhancements.css';
import { StoreProvider } from '@/components/store';
import Shell from '@/components/shell';
export const metadata: Metadata = { title: 'iTech Computers · Store Manager', description: 'Billing, inventory and service management for iTech Computers.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><StoreProvider><Shell>{children}</Shell></StoreProvider></body></html>; }
