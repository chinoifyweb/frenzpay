"use client";

import Link from "next/link";
import { Globe, Shield, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const values = [
  {
    icon: Lightbulb,
    title: "Transparency",
    description:
      "No hidden fees, no surprise charges. We publish our pricing openly and explain every cost upfront. You always know exactly what you're paying.",
  },
  {
    icon: Shield,
    title: "Security",
    description:
      "Your money and data are protected with bank-grade encryption, mandatory 2FA, and thorough KYC verification. We take security as seriously as any traditional bank.",
  },
  {
    icon: Globe,
    title: "Simplicity",
    description:
      "Complex financial infrastructure, simple user experience. We handle the hard parts so you can focus on your work, not your payment logistics.",
  },
];

const team = [
  {
    name: "Adebayo Ogunlesi",
    role: "Co-founder & CEO",
    bio: "Former fintech engineer. Passionate about financial inclusion across Africa.",
  },
  {
    name: "Chioma Nwosu",
    role: "Co-founder & CTO",
    bio: "Previously built payment infrastructure at Flutterwave. Deep expertise in cross-border payments.",
  },
  {
    name: "Emeka Okafor",
    role: "Head of Compliance",
    bio: "10+ years in financial regulation. Former compliance lead at a top Nigerian bank.",
  },
  {
    name: "Fatima Abdullahi",
    role: "Head of Product",
    bio: "Product designer turned PM. Obsessed with building tools that feel effortless to use.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Built for Africans who{" "}
            <span className="text-primary">work globally</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Millions of talented Africans work for international companies,
            freelance for global clients, and create for worldwide audiences. Yet
            getting paid remains unnecessarily complex and expensive. We&apos;re
            changing that.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border bg-card p-8 sm:p-12">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
                Our Mission
              </h2>
              <p className="mt-4 text-2xl font-medium leading-relaxed text-foreground sm:text-3xl">
                To make receiving international payments as simple as receiving a
                text message.
              </p>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                We believe that where you live should not determine how easily
                you can get paid for your work. Frenz Pay eliminates the friction
                of cross-border payments by giving you virtual bank accounts in
                major currencies and the ability to withdraw directly to
                your Naira account — all from a single, clean dashboard.
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                No more waiting days for wire transfers. No more losing 5-10% to
                unfavorable exchange rates. No more rejected payments because
                your bank doesn&apos;t support certain corridors. Just share your
                account details, receive money, and withdraw.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Our values
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted-foreground">
            Three principles that guide everything we build.
          </p>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-border bg-card p-8"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <value.icon className="size-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {value.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Meet the team
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted-foreground">
            A small, focused team with deep experience in fintech, payments, and
            compliance.
          </p>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member) => (
              <div
                key={member.name}
                className="rounded-2xl border border-border bg-card p-6 text-center"
              >
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
                  <span className="text-2xl font-bold text-muted-foreground">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {member.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-primary">
                  {member.role}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Join us on our mission
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Whether you&apos;re a freelancer looking for a better way to get paid
            or someone who wants to help build the future of cross-border
            payments in Africa.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a
              href="#"
              className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <div className="text-left"><div className="text-[10px] leading-none opacity-70">Download on the</div><div className="text-sm font-semibold leading-tight">App Store</div></div>
            </a>
            <a
              href="#"
              className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302L15.395 13l2.303-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
              <div className="text-left"><div className="text-[10px] leading-none opacity-70">Get it on</div><div className="text-sm font-semibold leading-tight">Google Play</div></div>
            </a>
            <Link
              href="/contact"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 px-8 text-base"
              )}
            >
              Get in Touch
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
