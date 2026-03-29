'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const appHref = 'https://app.usecanon.com';

const navLinks = [
  { title: 'Features', href: '#features' },
  { title: 'How It Works', href: '#workflow' },
  { title: 'Integrations', href: '#integrations' },
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
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/45 backdrop-blur-2xl">
            <nav className="relative mx-auto flex max-w-[94rem] items-center justify-between px-4 py-4 md:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.1]">
                    <Image
                        src="/web-app-manifest-512x512.png"
                        alt="Canon"
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full border border-white/20"
                    />
                    <div className="flex flex-col leading-tight">
                        <span className="font-semibold text-white">Canon</span>
                        <span className="text-[11px] uppercase tracking-[0.24em] text-white/55">Engineering Signals</span>
                    </div>
                </Link>

                <div className="hidden items-center gap-8 lg:flex">
                    {navLinks.map((link) => (
                        <a
                            key={link.title}
                            href={link.href}
                            className="relative pb-3 pt-1 text-sm font-medium uppercase tracking-[0.18em] text-white/68 transition-colors hover:text-white"
                            onClick={(e) => handleNavLinkClick(e, link.href)}
                        >
                            {link.title}
                        </a>
                    ))}
                </div>

                <div className="hidden items-center gap-3 lg:flex">
                    <Button variant="secondary" className="rounded-full border-white/12 bg-white/[0.06] text-white hover:border-white/18 hover:bg-white/[0.1]" asChild>
                        <a href={appHref} target="_blank" rel="noopener noreferrer">
                            Sign In
                        </a>
                    </Button>
                    <Button className="rounded-full border-white/15 bg-white text-black hover:bg-white/90" asChild>
                        <a href={appHref} target="_blank" rel="noopener noreferrer">
                            Request Access
                            <ArrowRight className="h-4 w-4" />
                        </a>
                    </Button>
                </div>

                <div className="flex items-center gap-2 lg:hidden">
                    <Button
                        variant="secondary"
                        className="h-11 w-11 rounded-full border-white/12 bg-white/[0.06] p-0"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X className="h-5 w-5 text-white" /> : <Menu className="h-5 w-5 text-white" />}
                    </Button>
                </div>
            </nav>

            {mobileOpen && (
                <div className="relative border-t border-white/10 bg-black/55 px-4 py-4 backdrop-blur-2xl lg:hidden">
                    <nav className="grid gap-2">
                        {navLinks.map((link) => (
                            <a
                                key={link.title}
                                href={link.href}
                                className="flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-white/90 transition hover:bg-white/[0.08]"
                                onClick={(e) => handleNavLinkClick(e, link.href)}
                            >
                                {link.title}
                            </a>
                        ))}
                    </nav>
                    <div className="mt-3 grid gap-2">
                        <Button variant="ghost" className="w-full justify-start text-white/80 hover:text-white" asChild>
                            <a href={appHref} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>
                                Sign In
                            </a>
                        </Button>
                        <Button className="w-full rounded-full border-white/15 bg-white text-black hover:bg-white/90" asChild>
                            <a href={appHref} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>
                                Request Access
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </div>
            )}
        </header>
    );
}
