// app/layout.tsx
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import WalletContextProvider from "./components/WalletContextProvider";

export const metadata = {
  title: "Group Fund",
  description: "Solana Group Fund Manager",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}
