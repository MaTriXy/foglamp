import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNavbar } from "@/components/marketing/navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Sticky-footer reveal (fancycomponents.dev/docs/components/blocks/sticky-footer):
    // the footer is pinned to the viewport bottom (sticky bottom-0, z-0) and sits
    // *behind* the page, which carries a solid background and a higher z-index.
    // Scrolling to the end slides the content up and uncovers the footer.
    <div className="relative bg-background">
      <div className="relative z-10 flex min-h-svh flex-col bg-background">
        <MarketingNavbar />
        <main className="flex-1">{children}</main>
      </div>
      <MarketingFooter />
    </div>
  );
}
