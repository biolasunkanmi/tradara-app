import type { Metadata, Viewport } from 'next';  error in Cannot find module 'next' or its corresponding type declarations.
import { Inter, JetBrains_Mono } from 'next/font/google';
error : Cannot find module 'next/font/google' or its corresponding type declarations.
import './globals.css';

import { ThemeProvider } from '@/providers/ThemeProvider';
error : Cannot find module '@/providers/ThemeProvider' or its corresponding type declarations.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://bioportfolio.dev'),

  title: {
    default: 'Bello Ibraheem Olasunkanmi',
    template: '%s | Bello Ibraheem Olasunkanmi',
  },

  description:
    'Computer Science student at LAUTECH, Full-Stack Software Developer, Cybersecurity Enthusiast and creator of TRADARA — an AI-powered global marketplace.',

  applicationName: 'Bello Portfolio',

  keywords: [
    'Bello Ibraheem Olasunkanmi',
    'Portfolio',
    'Full Stack Developer',
    'React',
    'Next.js',
    'TypeScript',
    'Node.js',
    'NestJS',
    'MongoDB',
    'Cybersecurity',
    'AI',
    'TRADARA',
    'Software Engineer',
    'Nigeria',
    'LAUTECH',
  ],

  authors: [
    {
      name: 'Bello Ibraheem Olasunkanmi',
    },
  ],

  creator: 'Bello Ibraheem Olasunkanmi',

  publisher: 'Bello Ibraheem Olasunkanmi',

  robots: {
    index: true,
    follow: true,
  },

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://bioportfolio.dev',

    title:
      'Bello Ibraheem Olasunkanmi | Full-Stack Software Developer',

    description:
      'Modern software engineering portfolio showcasing AI, cybersecurity, scalable backend systems and the TRADARA marketplace.',

    siteName: 'Bello Portfolio',
  },

  twitter: {
    card: 'summary_large_image',

    title:
      'Bello Ibraheem Olasunkanmi | Full-Stack Software Developer',

    description:
      'AI • Backend Engineering • Cybersecurity • Modern Web Development',
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#09090b',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: Readonly<RootLayoutProps>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="scroll-smooth"
    >
      <body
        className={[
          inter.variable,
          jetbrainsMono.variable,
          'font-sans',
          'bg-background',
          'text-foreground',
          'antialiased',
          'overflow-x-hidden',
          'min-h-screen',
        ].join(' ')}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}