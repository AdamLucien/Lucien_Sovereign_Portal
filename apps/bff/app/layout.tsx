import './globals.css';

export const metadata = {
  title: 'Lucien Sovereign BFF',
  description: 'Backend-for-Frontend for Lucien Sovereign Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
