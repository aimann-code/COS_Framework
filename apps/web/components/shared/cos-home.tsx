"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  FileCheck2,
  Fingerprint,
  Layers3,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Users,
  X,
} from "lucide-react";
import styles from "./cos-home.module.css";

function Brand() {
  return (
    <Link href="/" className={styles.brand}>
      <span className={styles.mark}>
        <Layers3 size={25} aria-hidden="true" />
      </span>
      <span>
        COS<small>CULINAOS</small>
      </span>
    </Link>
  );
}

const journeys = [
  {
    name: "Company",
    icon: Building2,
    title: "A workspace that starts with you.",
    subtitle: "Company onboarding",
    steps: [
      "Register your company",
      "Choose the services you need",
      "Submit payment for review",
      "Start after approval and activation",
    ],
    foot: "Your selection. A clear next step.",
    href: "/company-register",
    action: "Start company registration",
  },
  {
    name: "People",
    icon: Users,
    title: "A better beginning. Every time.",
    subtitle: "Employee Management",
    steps: [
      "HR registers the employee",
      "Employee sets their credentials",
      "HR verifies and activates access",
    ],
    foot: "Clear ownership, from day one.",
    href: "/sign-in?next=%2Fpeople",
    action: "Open People workspace",
  },
  {
    name: "Configure",
    icon: SlidersHorizontal,
    title: "Your process, with a clear review.",
    subtitle: "Service configuration",
    steps: [
      "Request an additional field or change",
      "Administrator reviews the request",
      "Approved settings become available",
    ],
    foot: "Every change has a review trail.",
    href: "#how-it-works",
    action: "See how company setup works",
  },
];

function WorkspacePreview() {
  const [selected, setSelected] = useState(0);
  const journey = journeys[selected];
  return (
    <div className={styles.visual}>
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.workspace}>
        <div className={styles.windowBar}>
          <span className={styles.windowDots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <ShieldCheck size={12} aria-hidden="true" /> COS WORKSPACE
          </span>
          <span>Illustrative view</span>
        </div>
        <div className={styles.workspaceBody}>
          <div className={styles.miniNav} aria-hidden="true">
            <span className={styles.miniLogo}>
              <Layers3 size={22} />
            </span>
            <Building2 size={19} />
            <Users size={19} />
            <CalendarDays size={19} />
            <SlidersHorizontal size={19} />
            <span className={styles.miniBottom}>
              <ShieldCheck size={18} />
            </span>
          </div>
          <div className={styles.workspaceContent}>
            <div className={styles.workspaceHeading}>
              <div>
                <span>YOUR COMPANY. YOUR NEXT CHAPTER.</span>
                <h2>Everything starts here.</h2>
              </div>
              <span className={styles.organizationIcon}>
                <Building2 size={21} aria-hidden="true" />
              </span>
            </div>
            <div
              className={styles.previewControls}
              aria-label="Explore workspace examples"
            >
              {journeys.map(({ name, icon: Icon }, index) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected === index}
                  aria-controls="workspace-preview"
                  onClick={() => setSelected(index)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {name}
                </button>
              ))}
            </div>
            <div
              className={styles.journey}
              id="workspace-preview"
              key={journey.name}
            >
              <div className={styles.journeyLabel}>
                <span aria-hidden="true" />
                <span>{journey.subtitle}</span>
              </div>
              <h3>{journey.title}</h3>
              <ol>
                {journey.steps.map((step, index) => (
                  <li key={step}>
                    <span aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step}
                    <span className={styles.stepLine} aria-hidden="true" />
                  </li>
                ))}
              </ol>
              <div className={styles.journeyFoot}>
                <span>{journey.foot}</span>
                <Link href={journey.href} aria-label={journey.action}>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.workspaceFooter}>
          <span>
            <span /> Made for your company
          </span>
          <span>
            People <i /> Services <i /> Approvals
          </span>
        </div>
      </div>
      <div className={styles.floatingNote}>
        <span>
          <Blocks size={19} aria-hidden="true" />
        </span>
        <div>
          Start with what you need
          <small>Add services as your business grows.</small>
        </div>
        <ArrowUpRight size={16} aria-hidden="true" />
      </div>
      <div className={styles.visualCaption}>
        Example journey · No live company or employee records
      </div>
    </div>
  );
}

function ServiceDiscovery() {
  return (
    <section
      id="services"
      className={styles.platform}
      aria-labelledby="services-title"
    >
      <div className={styles.container}>
        <div className={styles.sectionIntro}>
          <div>
            <span className={styles.eyebrow}>
              THE RIGHT SERVICES. YOUR CHOICE.
            </span>
            <h2 id="services-title">
              Start with your people.
              <br />
              <em>Build your way forward.</em>
            </h2>
          </div>
          <p>
            Choose services during company registration.
            <br />
            Review availability and charges before you submit.
          </p>
        </div>
        <div className={styles.serviceLayout}>
          <article className={styles.featuredService}>
            <div className={styles.serviceTop}>
              <span className={styles.serviceGlyph}>
                <Users size={26} aria-hidden="true" />
              </span>
              <span className={styles.serviceBadge}>START WITH HRMS</span>
            </div>
            <h3>
              A clearer way to care
              <br />
              for your people.
            </h3>
            <p>
              Bring employee information, everyday requests and reviewed changes
              into one focused workspace.
            </p>
            <ul className={styles.serviceFeatures}>
              <li>
                <Users size={18} aria-hidden="true" />
                <span>
                  <strong>Employee management</strong>Registration, profiles and
                  employee records.
                </span>
              </li>
              <li>
                <CalendarDays size={18} aria-hidden="true" />
                <span>
                  <strong>Everyday people services</strong>Choose available HR
                  services from the catalog.
                </span>
              </li>
              <li>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>
                  <strong>Configuration that fits</strong>Request fields and
                  settings, with administrator review.
                </span>
              </li>
            </ul>
            <Link href="/company-register" className={styles.primary}>
              Choose your services <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
          <div className={styles.serviceRoadmap}>
            <span className={styles.eyebrow}>ROOM TO GROW</span>
            <h3>
              Your next chapter,
              <br />
              already in view.
            </h3>
            <p>
              More ways to run your business are planned. Only services
              available in the registration catalog can be selected.
            </p>
            <article>
              <Truck size={23} aria-hidden="true" />
              <div>
                <h4>Operations</h4>
                <p>Procurement, inventory and day-to-day operations.</p>
              </div>
              <span>Planned</span>
            </article>
            <article>
              <ChartNoAxesCombined size={23} aria-hidden="true" />
              <div>
                <h4>Business insights</h4>
                <p>Reporting and a clearer view of business performance.</p>
              </div>
              <span>Planned</span>
            </article>
            <div className={styles.serviceNote}>
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                Your selected services are activated after payment review and
                approval.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const setupSteps = [
  {
    icon: Building2,
    title: "Register your company",
    text: "Tell us about your organization and create your company account.",
  },
  {
    icon: Blocks,
    title: "Choose your services",
    text: "Select what your team needs and review the charges for your selection.",
  },
  {
    icon: FileCheck2,
    title: "Submit for approval",
    text: "Submit your payment details. An administrator reviews them before activation.",
  },
  {
    icon: SlidersHorizontal,
    title: "Make it your workspace",
    text: "After activation, request extra fields or configuration changes for review.",
  },
];

function CompanySetup() {
  return (
    <section
      id="how-it-works"
      className={styles.setup}
      aria-labelledby="setup-title"
    >
      <div className={styles.container}>
        <div className={styles.sectionIntro}>
          <div>
            <span className={styles.eyebrow}>FROM SIGNUP TO EVERYDAY WORK</span>
            <h2 id="setup-title">
              Your company. Your services.
              <br />
              <em>A clear path to getting started.</em>
            </h2>
          </div>
          <Link href="/company-register" className={styles.textLink}>
            Register your company <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ol className={styles.setupSteps}>
          {setupSteps.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={21} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <p className={styles.setupNote}>
          <ShieldCheck size={17} aria-hidden="true" /> Additional fields and
          configuration changes become available only after administrator
          approval.
        </p>
      </div>
    </section>
  );
}

const roles = [
  {
    name: "HR teams",
    icon: Users,
    title: "A smoother employee journey.",
    text: "Register employees, maintain their records, verify access and review profile changes.",
    href: "/sign-in?next=%2Fpeople",
    action: "Open HR workspace",
    items: [
      "Employee registration",
      "Directory & documents",
      "Profile change review",
    ],
  },
  {
    name: "Employees",
    icon: Fingerprint,
    title: "Your details. Your next step.",
    text: "Access your own profile and request updates with a clear review process.",
    href: "/sign-in?next=%2Fpeople%2Fme",
    action: "Open my workspace",
    items: ["Personal profile", "Update requests", "Request history"],
  },
  {
    name: "Administrators",
    icon: SlidersHorizontal,
    title: "Configuration with control.",
    text: "Review employee form changes and keep the experience consistent for your team.",
    href: "/sign-in?next=%2Fpeople%2Fconfiguration",
    action: "Open admin workspace",
    items: [
      "Configuration review",
      "Field change requests",
      "Approval history",
    ],
  },
];

export default function COSHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [
    ["Services", "#services"],
    ["How it works", "#how-it-works"],
    ["Your workspace", "#solutions"],
  ];
  return (
    <div className={styles.home}>
      <a className={styles.skip} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand />
          <nav className={styles.navigation} aria-label="Main navigation">
            {navigation.map(([label, href], index) => (
              <a href={href} key={href}>
                {label}
                {index === 0 && <ChevronDown size={13} aria-hidden="true" />}
              </a>
            ))}
          </nav>
          <div className={styles.navActions}>
            <Link className={styles.signIn} href="/sign-in">
              Sign in <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link className={styles.primary} href="/company-register">
              Register company <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <button
              className={styles.menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <X size={21} aria-hidden="true" />
              ) : (
                <Menu size={21} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className={styles.mobileNav}
            aria-label="Mobile navigation"
          >
            {navigation.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ))}
            <Link href="/company-register" onClick={() => setMenuOpen(false)}>
              Register company <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        )}
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <span className={styles.heroEyebrow}>
                  <span /> YOUR BUSINESS. BEAUTIFULLY CONNECTED.
                </span>
                <h1 id="hero-title">
                  Your company.
                  <br />
                  <em>Your connected workspace.</em>
                </h1>
                <p>
                  Choose the services your team needs.
                  <br className={styles.desktopBreak} /> Bring your people and
                  everyday work together,
                  <br className={styles.desktopBreak} /> with room for what
                  comes next.
                </p>
                <div className={styles.heroActions}>
                  <Link className={styles.primary} href="/company-register">
                    Register your company{" "}
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <a className={styles.textLink} href="#services">
                    Explore services{" "}
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </a>
                </div>
                <div className={styles.heroProof}>
                  <span className={styles.teamIcons} aria-hidden="true">
                    <Building2 size={16} />
                    <Users size={16} />
                    <ShieldCheck size={16} />
                  </span>
                  <span>Your services. Your team. One place to work.</span>
                </div>
              </div>
              <WorkspacePreview />
            </div>
            <div className={styles.heroRail}>
              <span>A SIMPLE START. SPACE TO GROW.</span>
              <div>
                <Building2 size={17} aria-hidden="true" /> Company
              </div>
              <div>
                <Users size={17} aria-hidden="true" /> People
              </div>
              <div>
                <Blocks size={17} aria-hidden="true" /> Services
              </div>
              <div>
                <ShieldCheck size={17} aria-hidden="true" /> Approvals
              </div>
            </div>
          </div>
        </section>
        <ServiceDiscovery />
        <CompanySetup />
        <section
          id="solutions"
          className={styles.solutions}
          aria-labelledby="solutions-title"
        >
          <div className={styles.container}>
            <div className={styles.sectionIntro}>
              <div>
                <span className={styles.eyebrow}>ALREADY PART OF A TEAM?</span>
                <h2 id="solutions-title">
                  Good work starts
                  <br />
                  with the right workspace.
                </h2>
              </div>
              <p>
                A focused place for every role.
                <br />
                Sign in to continue your everyday work.
              </p>
            </div>
            <div className={styles.roleGrid}>
              {roles.map(
                ({ name, icon: Icon, title, text, href, action, items }) => (
                  <article className={styles.role} key={name}>
                    <span className={styles.roleLabel}>
                      <Icon size={18} aria-hidden="true" />
                      {name}
                    </span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <ul>
                      {items.map((item) => (
                        <li key={item}>
                          <Check size={13} aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link href={href}>
                      {action}
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </article>
                ),
              )}
            </div>
            <div className={styles.onboarding}>
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> Access follows your
                role and organization.
              </span>
              <span>
                New employee?{" "}
                <Link href="/sign-up">
                  Create your employee account{" "}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <small>HR verifies and activates access.</small>
              </span>
            </div>
          </div>
        </section>
        <section
          className={styles.container + " " + styles.cta}
          aria-labelledby="cta-title"
        >
          <div className={styles.ctaLines} aria-hidden="true" />
          <span className={styles.eyebrow}>
            YOUR COMPANY. YOUR NEXT CHAPTER.
          </span>
          <h2 id="cta-title">
            Start with what you need.
            <br />
            <em>Grow from there.</em>
          </h2>
          <p>A connected workspace, built around your business.</p>
          <div>
            <Link className={styles.lightButton} href="/company-register">
              Register your company <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className={styles.ctaSignIn} href="/sign-in">
              Already on COS? Sign in{" "}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div>
              <Brand />
              <p>
                The connected workspace
                <br />
                for a better way to work.
              </p>
            </div>
            <nav aria-label="Footer services links">
              <strong>Discover COS</strong>
              <a href="#services">Services</a>
              <a href="#how-it-works">How it works</a>
              <a href="#solutions">Your workspace</a>
            </nav>
            <nav aria-label="Footer company links">
              <strong>Your company</strong>
              <Link href="/company-register">Register company</Link>
              <Link href="/sign-in">Sign in</Link>
            </nav>
            <nav aria-label="Footer employee links">
              <strong>Your employee account</strong>
              <Link href="/sign-up">Employee signup</Link>
              <Link href="/sign-in?next=%2Fpeople%2Fme">My profile</Link>
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 COS · CulinaOS</span>
            <span>People. Process. Possibility.</span>
            <a href="#main-content">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
