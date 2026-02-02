'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Upload,
  Mail,
  Settings,
  LogOut,
  Sparkles,
  ChevronRight,
  Target,
  Radio,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';

interface SidebarProps {
  user: User;
  profile: Profile | null;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Listener', href: '/dashboard/listener', icon: Radio },
  { name: 'Prospects', href: '/dashboard/prospects', icon: Target },
  { name: 'Contacts', href: '/dashboard/contacts', icon: Users },
  { name: 'Team Network', href: '/dashboard/team', icon: UsersRound },
  { name: 'Import', href: '/dashboard/import', icon: Upload },
  { name: 'Enrich', href: '/dashboard/enrich', icon: Sparkles },
  { name: 'Connect Gmail', href: '/dashboard/connect', icon: Mail },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar({ user, profile }: SidebarProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-y-0 left-0 w-72 bg-dark-950 flex flex-col">
      {/* Logo */}
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-lg">Relationship</span>
            <span className="font-bold text-primary-400 text-lg"> Intel</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 overflow-y-auto">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-primary-600/20 to-primary-700/10 text-white border border-primary-500/20'
                    : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-400' : 'text-dark-500 group-hover:text-dark-300'}`} />
                <span className="flex-1">{item.name}</span>
                {isActive && (
                  <ChevronRight className="w-4 h-4 text-primary-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-dark-800">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-900/50">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <span className="text-sm font-semibold text-white">
                {user.email?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {profile?.full_name || 'User'}
            </p>
            <p className="text-xs text-dark-400 truncate">{user.email}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full mt-2 px-4 py-3 rounded-xl text-sm font-medium text-dark-400 hover:text-white hover:bg-dark-800/50 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
