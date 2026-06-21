import '../styles.css';
import type { ReactNode } from 'react';
import { Footer } from '../components/footer.js';
import { Header } from '../components/header.js';

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

const RootLayout = ({ children }: RootLayoutProps) => (
  <div className="bg-slate-50 text-slate-950 min-h-screen">
    <Header />
    <main className="mx-auto grid max-w-3xl gap-6 px-8 py-10">{children}</main>
    <Footer />
  </div>
);

export default RootLayout;

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
