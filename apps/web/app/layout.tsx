import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { SolanaProvider } from './components/solanaProvider';

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body>
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}