"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@foglamp/ui/components/navigation-menu";
import { cn } from "@foglamp/ui/lib/utils";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";

import { Logo } from "./logo";
import { products } from "./products";

const DOCS_URL = "https://docs.foglamp.dev";

function ProductsMenu() {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="text-muted-foreground">
        Product
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-80 gap-1 p-1.5">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <li key={product.slug}>
                <NavigationMenuLink
                  render={<Link href={product.href} />}
                  className="items-start gap-3 py-2"
                >
                  <span className={cn("mt-0.5 shrink-0", product.chipClassName)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{product.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {product.tagline}
                    </span>
                  </span>
                </NavigationMenuLink>
              </li>
            );
          })}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

export function MarketingNavbar() {
  // Swap the CTA for logged-in visitors. The marketing pages are public, so a
  // signed-in user landing here (e.g. via /homepage) gets a "Dashboard" link
  // instead of "Start monitoring".
  const { data: session } = authClient.useSession();
  const loggedIn = Boolean(session?.user);

  return (
    <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-md shadow-[0_1px_0_0_var(--border)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Foglamp home" className="flex items-center">
          <Logo />
        </Link>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <ProductsMenu />
            <NavigationMenuItem>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-muted-foreground"
                )}
                render={<Link href="/pricing" />}
              >
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-muted-foreground"
                )}
                render={<a href={DOCS_URL} />}
              >
                Docs
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Button size="sm" render={<Link href="/overview" />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/login" />}
                className="hidden sm:inline-flex"
              >
                Log in
              </Button>
              <Button size="sm" render={<Link href="/login" />}>
                Start monitoring
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
