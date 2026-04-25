import { Navbar } from "@/components/public/navbar";
import { Footer } from "@/components/public/footer";

// Revalidate static prerenders every 60 seconds.
//
// Next.js 15 defaults static segments to `Cache-Control: s-maxage=31536000`
// (1 year), which CyberPanel/LSCache happily honours forever — meaning
// public marketing-page edits don't reach visitors until we manually flush
// the edge cache. 60s is a reasonable trade-off: still fully cached for the
// vast majority of requests, but visible content updates land within a
// minute on the next deploy.
export const revalidate = 60;

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
