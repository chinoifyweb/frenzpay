"use client";

import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function ContactPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to send message");
    reset();
  };

  return (
    <>
      {/* Hero */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Get in <span className="text-primary">touch</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Have a question, feedback, or need help? We&apos;d love to hear from
            you. Our team typically responds within 24 hours.
          </p>
        </div>
      </section>

      {/* Contact content */}
      <section className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-16 lg:grid-cols-5">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
                {isSubmitSuccessful ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
                      <MessageSquare className="size-8 text-primary" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-foreground">
                      Message sent!
                    </h3>
                    <p className="mt-2 text-muted-foreground">
                      Thanks for reaching out. We&apos;ll get back to you within
                      24 hours.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full name</Label>
                        <Input
                          id="name"
                          placeholder="John Doe"
                          {...register("name", {
                            required: "Name is required",
                          })}
                          aria-invalid={!!errors.name}
                        />
                        {errors.name && (
                          <p className="text-sm text-destructive">
                            {errors.name.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="john@example.com"
                          {...register("email", {
                            required: "Email is required",
                            pattern: {
                              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                              message: "Enter a valid email",
                            },
                          })}
                          aria-invalid={!!errors.email}
                        />
                        {errors.email && (
                          <p className="text-sm text-destructive">
                            {errors.email.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        placeholder="How can we help?"
                        {...register("subject", {
                          required: "Subject is required",
                        })}
                        aria-invalid={!!errors.subject}
                      />
                      {errors.subject && (
                        <p className="text-sm text-destructive">
                          {errors.subject.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us more about your question or feedback..."
                        rows={6}
                        {...register("message", {
                          required: "Message is required",
                          minLength: {
                            value: 10,
                            message:
                              "Please provide at least 10 characters",
                          },
                        })}
                        aria-invalid={!!errors.message}
                      />
                      {errors.message && (
                        <p className="text-sm text-destructive">
                          {errors.message.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full text-base sm:w-auto sm:px-10"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Contact info */}
            <div className="lg:col-span-2">
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Email us
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    For general inquiries and support.
                  </p>
                  <a
                    href="mailto:hello@frenzpay.co"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <Mail className="size-4" />
                    hello@frenzpay.co
                  </a>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    WhatsApp
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chat with us directly on WhatsApp.
                  </p>
                  <a
                    href="https://wa.me/12365997663"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:underline"
                  >
                    <MessageSquare className="size-4" />
                    +1 (236) 599-7663
                  </a>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Social media
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Follow us for updates and announcements.
                  </p>
                  <div className="mt-3 space-y-2">
                    <a
                      href="https://twitter.com/frenzpay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium text-primary hover:underline"
                    >
                      Twitter / X: @frenzpay
                    </a>
                    <a
                      href="https://linkedin.com/company/frenzpay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium text-primary hover:underline"
                    >
                      LinkedIn: Frenz Pay
                    </a>
                    <a
                      href="https://instagram.com/frenzpay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium text-primary hover:underline"
                    >
                      Instagram: @frenzpay
                    </a>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-6">
                  <h3 className="text-base font-semibold text-foreground">
                    Looking for answers?
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Check our FAQ for quick answers to common questions.
                  </p>
                  <Link
                    href="/faq"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "mt-4"
                    )}
                  >
                    Visit FAQ
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
