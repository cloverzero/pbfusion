"use client";

import {
  IconMap,
  IconFolder,
  IconSettings,
  IconEqualNot,
  IconHelp,
  IconLayoutDashboard,
} from "@tabler/icons-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";

import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const isProjectPage = location.pathname.startsWith("/project/");

  const items: NavItem[] = [
    {
      title: "Projects",
      url: "/",
      icon: IconFolder,
    },
  ];

  if (isProjectPage) {
    const projectId = location.pathname.split("/")[2];
    items.push(
      {
        title: "Overview",
        url: `/project/${projectId}`,
        icon: IconLayoutDashboard,
      },
      {
        title: "Differences",
        url: `/project/${projectId}?tab=diffs`,
        icon: IconEqualNot,
      },
    );
  }

  items.push(
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
    },
    {
      title: "Help",
      url: "/help",
      icon: IconHelp,
    },
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <a>
                <IconMap className="!size-6" />
                <span className="text-base font-semibold">PBFusion</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
    </Sidebar>
  );
}
