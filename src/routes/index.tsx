import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import {
  ArrowRight,
  ChevronDown,
  Sparkles,
  Wand2,
  Copy,
  Layers,
  Link as LinkIcon,
  Users,
  Code2,
} from "lucide-react";


import musicPlayer from "@/assets/flowstep/musicPlayer-1bVmAsrL.webp";
import library from "@/assets/flowstep/library-C7vyAhQA.webp";
import designPower from "@/assets/flowstep/designPower-DPp4mU3M.webp";
import mindfulness from "@/assets/flowstep/mindfulness-D79w1wsL.webp";
import systemAccess from "@/assets/flowstep/systemAccess-C7M_IWvI.webp";
import ecommerce from "@/assets/flowstep/ecommerce-DLKdePey.webp";
import propertyPanel from "@/assets/flowstep/propertyPanel-Dh5nhBk1.png";
import sarah from "@/assets/flowstep/Sarah-DSIiYG0y.jpg";
import marcus from "@/assets/flowstep/Marcus-BLe5sCd6.jpg";
import emily from "@/assets/flowstep/Emily-mFsmGr5r.jpg";
import anna from "@/assets/flowstep/Anna-D40Ud1mf.jpg";
import alex from "@/assets/flowstep/Alex-SlO2GsJn.jpg";
import priya from "@/assets/flowstep/Priya-Ph5tG65j.jpg";
import enterKeyPoster from "@/assets/enter-key-hacker.jpeg";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flowstep — Generate real UI in seconds" },
      {
        name: "description",
        content:
          "Communicate visually. Get user feedback. Ship faster with fully editable designs.",
      },
      { property: "og:title", content: "Flowstep — Generate real UI in seconds" },
      {
        property: "og:description",
        content:
          "Communicate visually. Get user feedback. Ship faster with fully editable designs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img
        src={logoAsset}
        alt="Flowstep logo"
        className="h-8 w-8 rounded-lg object-cover"
      />
      <span className="text-lg font-semibold tracking-tight text-[#0b1220]">flowstep</span>
    </Link>
  );
}

function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}


function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  useEffect(() => {
    function honorStashedNext(hasSession: boolean) {
      if (!hasSession || typeof window === "undefined") return false;
      const raw = sessionStorage.getItem("flowstep:oauth_next");
      if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return false;
      sessionStorage.removeItem("flowstep:oauth_next");
      window.location.href = raw;
      return true;
    }
    function labelFor(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
      if (!user) return null;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.user_name === "string" && meta.user_name) ||
        null;
      if (name) return name;
      if (user.email) return user.email.split("@")[0];
      return "Account";
    }
    supabase.auth.getSession().then(({ data }) => {
      if (honorStashedNext(!!data.session)) return;
      setSignedIn(!!data.session);
      setUserLabel(labelFor(data.session?.user ?? null));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (honorStashedNext(!!session)) return;
      setSignedIn(!!session);
      setUserLabel(labelFor(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { signedIn, userLabel };
}


function Nav() {
  const navigate = useNavigate();
  const { signedIn, userLabel } = useSignedIn();
  const go = () => navigate({ to: signedIn ? "/account" : "/auth" });
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-[#f6f2ff]/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-[#0b1220]/80 md:flex">
          <button onClick={() => scrollToId("features")} className="flex items-center gap-1 hover:text-[#0b1220]">
            Explore <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={() => scrollToId("pricing")} className="hover:text-[#0b1220]">Pricing</button>
          <button onClick={() => scrollToId("faq")} className="hover:text-[#0b1220]">Docs</button>
        </nav>

        <div className="flex items-center gap-3">
          {!signedIn && (
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="hidden text-sm text-[#0b1220]/80 hover:text-[#0b1220] md:inline"
            >
              Sign In
            </button>
          )}
          <button
            onClick={go}
            className="flex items-center gap-2 rounded-full bg-[#0b1220] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            title={signedIn ? "Open app" : "Get started"}
          >
            {signedIn && userLabel ? (
              <>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold uppercase">
                  {userLabel.charAt(0)}
                </span>
                <span className="max-w-[140px] truncate">{userLabel}</span>
              </>
            ) : (
              "Get Started"
            )}
          </button>

        </div>
      </div>
    </header>
  );
}

function Hero() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const go = () => navigate({ to: "/app" });
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#f0e8ff] via-[#f4ecff] to-[#f8f2ff]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 pt-16 pb-24 lg:grid-cols-2 lg:pt-24">
        <div className="flex flex-col justify-center">
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-[#0b1220] sm:text-6xl lg:text-7xl">
            Generate<br />real UI in<br />seconds
          </h1>
          <p className="mt-6 max-w-md text-lg text-[#0b1220]/70">
            Communicate visually. Get user feedback. Ship faster with fully editable designs.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <button
              onClick={go}
              className="group inline-flex items-center gap-2 rounded-full bg-[#2b6bff] px-6 py-3 text-base font-medium text-white shadow-lg shadow-[#2b6bff]/30 hover:bg-[#1f57df]"
            >
              Try for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <p className="mt-3 text-sm text-[#0b1220]/50">No credit card required</p>
        </div>


        <div className="relative h-[560px] overflow-hidden lg:h-[640px] [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
          <div className="flex animate-marquee-y flex-col gap-6">
            {[...Array(2)].map((_, loop) => (
              <div key={loop} className="flex flex-col gap-6">
                <img src={musicPlayer} alt="Music player" className="w-full rounded-2xl shadow-xl ring-1 ring-black/5" />
                <img src={designPower} alt="Design landing" className="w-full rounded-2xl shadow-2xl ring-1 ring-black/5" />
                <img src={library} alt="Music library" className="w-full rounded-2xl shadow-xl ring-1 ring-black/5" />
                <img src={mindfulness} alt="Mindfulness" className="w-full rounded-2xl shadow-xl ring-1 ring-black/5" />
                <img src={ecommerce} alt="E-commerce" className="w-full rounded-2xl shadow-2xl ring-1 ring-black/5" />
                <img src={systemAccess} alt="System access" className="w-full rounded-2xl shadow-xl ring-1 ring-black/5" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

function CinematicReveal() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  // Scroll progress drives the entry animation (0 → 1 as it enters view).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const total = rect.height + vh;
        const scrolled = vh - rect.top;
        const p = Math.min(1, Math.max(0, scrolled / total));
        el.style.setProperty("--p", p.toFixed(4));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Mouse-driven 3D tilt for the keycap.
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -y * 12, ry: x * 16 });
  };
  const onLeave = () => setTilt({ rx: 0, ry: 0 });


  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-[#050505] text-white"
      style={{
        ["--p" as string]: 0,
        minHeight: "100dvh",
        paddingTop: "max(6rem, calc(env(safe-area-inset-top) + 4rem))",
        paddingBottom: "max(6rem, calc(env(safe-area-inset-bottom) + 4rem))",
      } as React.CSSProperties}
    >
      {/* ambient warm glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(255,190,120,0.18), rgba(0,0,0,0) 55%), radial-gradient(ellipse at 20% 90%, rgba(80,140,255,0.10), rgba(0,0,0,0) 60%)",
        }}
      />

      {/* subtle grid floor */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0) 80%)",
          transform: "perspective(700px) rotateX(60deg) translateY(20%) scale(1.6)",
          transformOrigin: "center bottom",
        }}
      />

      <div
        className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.15fr]"
        style={{
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        {/* Left: copy */}
        <div
          className="relative"
          style={{
            transform: "translateY(calc((1 - var(--p)) * 24px))",
            opacity: "calc(0.2 + var(--p) * 1)",
            transition: "opacity 200ms linear",
          }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.35em] text-white/60 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ffb86b] shadow-[0_0_10px_#ffb86b]" />
            One keystroke away
          </div>
          <h2 className="font-serif text-4xl leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Press <span className="italic text-white/80">Enter</span>.
            <br />
            A world builds
            <br />
            itself inside.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60 sm:text-lg">
            Every prompt is a tiny studio. Behind the glass, an entire workshop of
            engineers, monitors, and blinking machines assembles your idea in real
            time — so all you do is hit&nbsp;<span className="text-white">Enter</span>.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            {[
              { k: "Renders", v: "Real-time" },
              { k: "Camera", v: "Macro CGI" },
              { k: "Lens", v: "ƒ/1.4" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col">
                <div className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  {s.k}
                </div>
                <div className="mt-1 text-sm text-white/85">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: the 3D keycap stage */}
        <div
          ref={wrapRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="relative mx-auto w-full max-w-[640px]"
          style={{ perspective: "1400px" }}
        >
          {/* soft floor shadow */}
          <div
            className="pointer-events-none absolute left-1/2 bottom-[6%] h-16 w-4/5 -translate-x-1/2 rounded-[50%] bg-black/70 blur-3xl"
            style={{
              opacity: "calc(0.35 + var(--p) * 0.35)",
            }}
          />

          {/* rim light halo */}
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(255,205,150,0.28), rgba(255,205,150,0) 55%)",
              filter: "blur(20px)",
            }}
          />

          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-[28px] bg-[#0a0a0a] ring-1 ring-white/10"
            style={{
              transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0) scale(calc(0.94 + var(--p) * 0.06))`,
              transformStyle: "preserve-3d",
              transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow:
                "0 60px 140px -30px rgba(255,180,110,0.28), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* the animated keycap product shot */}
            <img
              src={enterKeyPoster}
              alt="Macro shot of a backlit Enter key in a dark workshop"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                transform: "translateZ(60px)",
              }}
            />

            {/* glass sheen sweeping across */}
            <div
              className="pointer-events-none absolute inset-0 mix-blend-screen"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 60%)",
                transform: "translateX(calc(var(--p) * 40% - 20%))",
                transition: "transform 200ms linear",
              }}
            />

            {/* cinematic vignette */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 100%)",
              }}
            />

            {/* HUD label bottom-left */}
            <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-white/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5a5a]" />
              REC · 04K · Macro
            </div>

            {/* HUD ticks top-right */}
            <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1 font-mono text-[10px] tracking-widest text-white/60">
              <span>ISO 200</span>
              <span>ƒ/1.4</span>
              <span>1/48s</span>
            </div>
          </div>

          {/* orbiting caption chips floating in 3D */}
          <div
            className="pointer-events-none absolute -left-4 top-8 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md sm:-left-8"
            style={{
              transform: `translateZ(80px) translateY(calc((1 - var(--p)) * 20px)) rotateY(${tilt.ry * 0.4}deg)`,
              opacity: "calc(0.2 + var(--p) * 1)",
            }}
          >
            <span className="mr-2 text-[#ffb86b]">◆</span> Ray-traced glass
          </div>
          <div
            className="pointer-events-none absolute -right-2 bottom-14 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md sm:-right-6"
            style={{
              transform: `translateZ(100px) translateY(calc((1 - var(--p)) * -20px)) rotateY(${tilt.ry * 0.4}deg)`,
              opacity: "calc(0.2 + var(--p) * 1)",
            }}
          >
            <span className="mr-2 text-[#7aa2ff]">●</span> Live workshop inside
          </div>
        </div>
      </div>
    </section>
  );
}


function ConceptToClarity() {
  return (
    <section className="bg-[#f8f2ff] py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-5xl">
          From concept to clarity
        </h2>
        <p className="mt-4 text-lg text-[#0b1220]/60">
          See how Flowstep turns your imagination into shippable UI.
        </p>
      </div>
    </section>
  );
}

function SkipBlank() {
  const collaborators = [
    { name: "Sarah", img: sarah, color: "bg-orange-400" },
    { name: "Karolis", img: marcus, color: "bg-emerald-400" },
    { name: "Rasmus", img: alex, color: "bg-pink-400" },
  ];
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-5xl">
            Skip the blank canvas
          </h2>
          <p className="mt-3 text-lg text-[#0b1220]/60">
            Generate screens in seconds. Stay in flow.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-[#f4ecff] to-[#eae0ff] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex -space-x-2">
              {collaborators.map((c) => (
                <img
                  key={c.name}
                  src={c.img}
                  alt={c.name}
                  className="h-8 w-8 rounded-full ring-2 ring-white"
                />
              ))}
              <div className="flex items-center pl-4 text-sm text-[#0b1220]/70">
                {collaborators.map((c) => c.name).join(" · ")}
              </div>
            </div>
            <div className="rounded-full bg-white/70 px-4 py-1.5 text-sm text-[#0b1220]/70">
              Food delivery app
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <img src={mindfulness} alt="" className="rounded-2xl shadow-xl ring-1 ring-black/5" />
            <img src={musicPlayer} alt="" className="rounded-2xl shadow-xl ring-1 ring-black/5" />
            <img src={library} alt="" className="rounded-2xl shadow-xl ring-1 ring-black/5" />
          </div>

          <div className="mt-6 flex justify-end">
            <img
              src={propertyPanel}
              alt="Editor property panel"
              className="w-72 rounded-2xl shadow-2xl ring-1 ring-black/5"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Sparkles,
    title: "Generate design in seconds",
    body:
      "Chat with Flowstep like you would with a designer. Describe what you want and watch it appear on the infinite canvas.",
    link: "Learn about AI generation",
  },
  {
    icon: Wand2,
    title: "Edit with AI or manually",
    body:
      "You have full control to customize your design — no need to learn complex tooling. Just focus on your idea.",
    link: "Learn about editing",
  },
  {
    icon: Copy,
    title: "Copy to Figma instantly",
    body:
      "Select any design in Flowstep and copy it straight into your Figma file. Just use ⌘C and ⌘V. No plugin or extension needed.",
    link: "Learn more about Figma integration",
  },
  {
    icon: Layers,
    title: "Multiple screens at once",
    body:
      "Generate full experiences in one go. Create login screens, dashboards, profile pages, and anything else you can imagine.",
    link: "Learn about multi-screen",
  },
  {
    icon: LinkIcon,
    title: "Design using references",
    body:
      "Attach a PRD to give more context, upload an image for inspiration, or paste a link for reference.",
    link: "Learn about design references",
  },
  {
    icon: Users,
    title: "Create together, anywhere",
    body:
      "Design with your team via real-time collaboration. See cursors move, keep edits in sync, and share feedback instantly.",
    link: "Learn about collaboration",
  },
  {
    icon: Code2,
    title: "UI that's 1:1 with code",
    body:
      "Export clean, production-ready code that engineers can actually use. Built with React, TypeScript, and Tailwind CSS.",
    link: "See an example",
  },
];

function Features() {
  return (
    <section id="features" className="bg-[#f8f2ff] py-24">

      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-5xl">
            Build better products
          </h2>
          <p className="mt-3 text-lg text-[#0b1220]/60">
            Powered by Flowstep's Imagination Algorithm.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-3xl border border-black/5 bg-white p-8 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2b6bff]/10 text-[#2b6bff]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold text-[#0b1220]">{f.title}</h3>
                <p className="mt-3 text-[#0b1220]/60">{f.body}</p>
                <a
                  href="#"
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[#2b6bff] hover:underline"
                >
                  {f.link} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const testimonials = [
  {
    name: "Sarah",
    role: "Senior Product Manager",
    img: sarah,
    quote:
      "VERY excited about this and shared it with our designer! Worked exactly like you said it would. Really impressed right out the gate.",
  },
  {
    name: "Marcus",
    role: "Product Designer",
    img: marcus,
    quote:
      "You simplify ideas. I really like the tool to kickstart the design process. It saves us hours every week.",
  },
  {
    name: "Emily",
    role: "Lead Product Designer",
    img: emily,
    quote:
      "My experience with using the product is great. Quite impressed with the outcome and the attention to detail.",
  },
  {
    name: "Anna",
    role: "Software Engineer",
    img: anna,
    quote:
      "Great functionality. Excellent at design tasks. Very impressed with how it handles complex workflows.",
  },
  {
    name: "Alex",
    role: "Senior Product Designer",
    img: alex,
    quote:
      "Been using Flowstep for some personal projects exclusively in the workflow for app ideas. It is solid and user focused which I love.",
  },
  {
    name: "Priya",
    role: "Product Manager",
    img: priya,
    quote:
      "Stunned with the design that I got with a prompt. Importantly the next page ideas was simply awesome. Great work!",
  },
];

function Testimonials() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-5xl">
            Made by designers, for dreamers
          </h2>
          <p className="mt-3 text-lg text-[#0b1220]/60">Loved by teams who ship fast.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-3xl border border-black/5 bg-[#f8f6ff] p-8"
            >
              <blockquote className="text-[#0b1220]/80">"{t.quote}"</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <img src={t.img} alt={t.name} className="h-11 w-11 rounded-full object-cover" />
                <div>
                  <div className="text-sm font-semibold text-[#0b1220]">{t.name}</div>
                  <div className="text-sm text-[#0b1220]/60">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "How do I get started?",
    a: "Sign up for a free account, then start generating designs immediately. Invite your team and they can collab with you in minutes.",
  },
  {
    q: "How much does it cost?",
    a: "It's free to start. See our full pricing plans for details.",
  },
  {
    q: "Do I need design skills to use Flowstep?",
    a: "Not at all. Just describe what you want and let Flowstep handle the design work for you.",
  },
  {
    q: "Does Flowstep use my data to train AI models?",
    a: "No, we don't use your personal data to train AI models, and we don't allow our LLM providers to do so. We may use aggregated and anonymized feedback to improve our outputs.",
  },
  {
    q: "How does Flowstep handle data privacy and security?",
    a: "We take data privacy and security seriously. We use all security measures to protect your data. Check out our Privacy Policy for details.",
  },
  {
    q: "Who is behind Flowstep?",
    a: "Check our About page to meet the team and see what we're up to.",
  },
  {
    q: "Does Flowstep replace Figma?",
    a: "Soon.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-[#f8f2ff] py-24">

      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-5xl">
            FAQs
          </h2>
          <p className="mt-3 text-lg text-[#0b1220]/60">
            Everything you need to know about Flowstep
          </p>
        </div>

        <div className="divide-y divide-black/10 rounded-2xl border border-black/5 bg-white">
          {faqs.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
              >
                <span className="font-medium text-[#0b1220]">{f.q}</span>
                <ChevronDown
                  className={`h-5 w-5 text-[#0b1220]/50 transition-transform ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-[#0b1220]/70">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const go = () => navigate({ to: "/app" });
  return (
    <section id="pricing" className="relative overflow-hidden bg-gradient-to-b from-[#f8f2ff] to-[#e9dcff] py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-[#0b1220] sm:text-6xl">
          What will you design?
        </h2>
        <p className="mt-4 text-lg text-[#0b1220]/60">
          Join thousands of people designing with Flowstep
        </p>
        <div className="mt-8 flex justify-center">
          <button
            onClick={go}
            className="inline-flex items-center gap-2 rounded-full bg-[#2b6bff] px-6 py-3 text-base font-medium text-white shadow-lg shadow-[#2b6bff]/30 hover:bg-[#1f57df]"
          >
            {signedIn ? "Open app" : "Start for free"} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-[#0b1220]/50">No credit card required</p>
      </div>
    </section>
  );
}


function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
        <Logo />
        <div className="flex gap-6 text-sm text-[#0b1220]/60">
          <button onClick={() => scrollToId("faq")} className="hover:text-[#0b1220]">Privacy</button>
          <button onClick={() => scrollToId("faq")} className="hover:text-[#0b1220]">Terms</button>
          <button onClick={() => scrollToId("faq")} className="hover:text-[#0b1220]">Support</button>
        </div>

        <div className="text-sm text-[#0b1220]/50">© {new Date().getFullYear()} Flowstep</div>
      </div>
    </footer>
  );
}

function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal${shown ? " reveal-in" : ""}`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <Hero />
      <Reveal>
        <CinematicReveal />
      </Reveal>
      <Reveal delay={60}>
        <ConceptToClarity />
      </Reveal>
      <Reveal>
        <SkipBlank />
      </Reveal>
      <Reveal delay={60}>
        <Features />
      </Reveal>
      <Reveal>
        <Testimonials />
      </Reveal>
      <Reveal delay={60}>
        <FAQ />
      </Reveal>
      <Reveal>
        <FinalCTA />
      </Reveal>
      <Footer />
    </div>
  );
}
