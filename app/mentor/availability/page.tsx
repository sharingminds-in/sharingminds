"use client"

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { MentorAvailabilityManager } from '@/components/mentor/availability/mentor-availability-manager';
import { useAuth } from '@/contexts/auth-context';
import dynamic from 'next/dynamic';
import {
  buildDashboardSectionUrl,
  resolveDashboardSection,
} from '@/lib/dashboard/sections';

const DynamicMentorSidebar = dynamic(() => import('@/components/mentor/sidebars/mentor-sidebar').then(mod => mod.MentorSidebar), {
  ssr: false,
  loading: () => <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
});


export default function MentorAvailabilityPage() {
  const { session, mentorProfile, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoading && mounted) {
      // Redirect if not authenticated
      if (!session) {
        router.push('/auth/signin');
        return;
      }

      // Check if user is a mentor
      if (!mentorProfile) {
        router.push('/become-expert');
        return;
      }
    }
  }, [session, mentorProfile, isLoading, router, mounted]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
        <SidebarProvider defaultOpen={false}>
          <div className="flex min-h-screen w-full">
            <DynamicMentorSidebar
              activeSection="availability"
              onSectionChange={() => {}}
            />
            <SidebarInset className="flex flex-col flex-1">
              <Header />
              <main className="flex-1 p-6">
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full">
            <DynamicMentorSidebar
              activeSection="availability"
              onSectionChange={(section) => {
                if (section === 'availability') return;
                const nextSection = resolveDashboardSection(
                  section,
                  'mentor',
                  'dashboard',
                  'dashboard'
                );
                router.push(buildDashboardSectionUrl('/dashboard', nextSection));
              }}
            />
          <SidebarInset className="flex flex-col flex-1">
            <Header showSidebarTrigger />
            <main className="flex-1 p-6">
              <div className="max-w-6xl mx-auto">
                <MentorAvailabilityManager />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
