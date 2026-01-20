'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';

const appHref = 'https://sync-swart.vercel.app/login';

const navLinks = [
    { title: 'Features', href: '#features' },
    { title: 'How It Works', href: '#workflow' },
    { title: 'Security', href: '#security' },
];

export function Navigation() {
    const [mobileOpen, setMobileOpen] = useState(false);

    // Handle smooth scrolling with offset for anchor links in navigation
    const handleNavLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                const headerHeight = 77; // Navigation bar height + 5px spacing
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth',
                });

                // Close mobile menu if open
                setMobileOpen(false);
            }
        }
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/70 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
            <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                {/* Logo Section */}
                <Link href="/" className="flex items-center gap-3 z-10">
                    <img
                        src="/web-app-manifest-512x512.png"
                        alt="Canon"
                        className="h-10 w-10 rounded-xl border border-white/10"
                    />
                    <div>
                        <p className="text-base font-semibold text-white">Canon</p>
                    </div>
                </Link>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-6 z-10">
                    <NavigationMenu>
                        <NavigationMenuList>
                            {navLinks.map((link) => (
                                <NavigationMenuItem key={link.title}>
                                    <a
                                        href={link.href}
                                        className={cn(
                                            navigationMenuTriggerStyle(),
                                            'text-white/80 hover:text-white'
                                        )}
                                        onClick={(e) => handleNavLinkClick(e, link.href)}
                                    >
                                        {link.title}
                                    </a>
                                </NavigationMenuItem>
                            ))}
                        </NavigationMenuList>
                    </NavigationMenu>

                    <div className="flex items-center gap-3 ml-4">
                        <Button variant="ghost" asChild>
                            <a href={appHref} target="_blank" rel="noopener noreferrer">
                                Sign In
                            </a>
                        </Button>
                        <Button asChild>
                            <a href={appHref} target="_blank" rel="noopener noreferrer">
                                Get Started
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </div>

                {/* Mobile Navigation */}
                <div className="flex items-center gap-2 md:hidden z-10">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? (
                            <X className="h-5 w-5 text-white" />
                        ) : (
                            <Menu className="h-5 w-5 text-white" />
                        )}
                    </Button>
                </div>
            </nav>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div className="relative border-t border-white/10 bg-black/95 backdrop-blur-xl md:hidden">
                    <div className="mx-auto max-w-7xl px-4 py-4">
                        <nav className="flex flex-col gap-2">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.title}
                                    href={link.href}
                                    className={cn(
                                        'rounded-lg px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white'
                                    )}
                                    onClick={(e) => {
                                        handleNavLinkClick(e, link.href);
                                        setMobileOpen(false);
                                    }}
                                >
                                    {link.title}
                                </Link>
                            ))}
                            <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-4">
                                <Button variant="ghost" className="w-full justify-start" asChild>
                                    <a
                                        href={appHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Sign In
                                    </a>
                                </Button>
                                <Button className="w-full" asChild>
                                    <a
                                        href={appHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        Get Started
                                        <ArrowRight className="h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                        </nav>
                    </div>
                </div>
            )}
        </header>
    );
}
