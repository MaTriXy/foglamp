"use client";

import {
  IconAlertTriangle,
  IconBuilding,
  IconChevronDown,
  IconCoin,
  IconDotsVertical,
  IconFlask,
  IconLayoutDashboard,
  IconListTree,
  IconLogout,
  IconPlus,
  IconRobot,
  IconSettings,
  IconTimeline,
} from "@tabler/icons-react";
import { Avatar, AvatarFallback } from "@watchtower/ui/components/avatar";

import { getGoogleFavicon } from "@/lib/favicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchtower/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@watchtower/ui/components/sidebar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { ThemeSwitcher } from "@/components/theme-switcher";

import { ProjectProvider, useProject } from "./project-context";

const nav = [
  { href: "/overview", label: "Overview", icon: IconLayoutDashboard },
  { href: "/traces", label: "Traces", icon: IconListTree },
  { href: "/workflows", label: "Workflows", icon: IconTimeline },
  { href: "/agents", label: "Agents", icon: IconRobot },
  { href: "/alerts", label: "Alerts", icon: IconAlertTriangle },
] as const;

const account = [
  { href: "/settings", label: "Settings", icon: IconSettings },
  { href: "/settings/pricing", label: "Pricing", icon: IconCoin },
] as const;

// Inlined by Next at build time. The Admin tools (synthetic ingest, raw pricing
// table) are dev-only and never shipped in a production build (e.g. Docker).
const isDev = process.env.NODE_ENV !== "production";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

// A project's favicon (from its URL) or a building placeholder, in a rounded box.
function ProjectIcon({
  url,
  size = "md",
}: {
  url: string | null | undefined;
  size?: "sm" | "md";
}) {
  const box =
    size === "md"
      ? "size-8 rounded-md shadow-(--custom-shadow)"
      : "size-5 rounded";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external favicon service, no optimization wanted
      <img
        src={getGoogleFavicon(url)}
        alt=""
        className={`${box} bg-background object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex aspect-square items-center justify-center bg-primary/10 text-primary ${box}`}
    >
      <IconBuilding className={size === "md" ? "size-4" : "size-3.5"} />
    </div>
  );
}

function ProjectSwitcher() {
  const { project, projects, setProjectId } = useProject();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <ProjectIcon url={project?.url} />
            <div className="flex flex-1 flex-col text-left text-sm leading-tight ml-0.5">
              <span className="truncate font-medium">
                {project?.name ?? "Select project"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {project?.orgName ?? "No project"}
              </span>
            </div>
            <IconChevronDown className="ml-auto size-4 opacity-30" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="min-w-(--anchor-width)"
          >
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setProjectId(p.id)}>
                <ProjectIcon url={p.url} size="sm" />
                <div className="flex flex-1 flex-col">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.orgName}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>
              <IconPlus />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const name = session?.user.name || email || "Account";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar size="sm">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            </div>
            <IconDotsVertical className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            sideOffset={8}
            className="min-w-(--anchor-width)"
          >
            <DropdownMenuLabel>{email}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href="/settings" />}>
              <IconSettings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/login") },
                })
              }
            >
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProjectProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <Sidebar variant="inset">
          <SidebarHeader>
            <ProjectSwitcher />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Observability</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(pathname, item.href)}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {account.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(pathname, item.href)}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isDev && (
              <SidebarGroup>
                <SidebarGroupLabel>Developer</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={isActive(pathname, "/admin")}
                        render={<Link href="/admin" />}
                      >
                        <IconFlask />
                        <span>Admin</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter>
            <NavUser />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto">
              <ThemeSwitcher />
            </div>
          </header>
          {/* The scroll viewport is a plain block with a definite height
              (flex-1 + min-h-0); the flex-column layout lives in a child so the
              scroll container itself never tries to flex-fit its content. */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 p-6">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ProjectProvider>
  );
}
