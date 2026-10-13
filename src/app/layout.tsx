import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'University SIS',
  description: 'Backend-ready SIS',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}