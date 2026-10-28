import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Session } from "../apps/web/lib/shared/cos-api";
import type {
  CompanyRegistration,
  CompanySummary,
  CompanyWorkspace,
  ConfigurationReview,
  PaymentReview,
  PlatformOverview,
  ServiceCatalog,
  ServiceDefinition,
} from "../apps/web/lib/shared/commerce";

// Synthetic browser fixtures follow CommerceContracts.java. These tests exercise
// UI state and request contracts; backend persistence and authority use Java tests.
const acaciaId = "10000000-0000-0000-0000-000000000001";
const brambleId = "10000000-0000-0000-0000-000000000002";
const timestamp = "2026-10-28T06:30:00Z";
const services: ServiceDefinition[] = [
  {
    service_code: "EMPLOYEE_MANAGEMENT",
    name: "Employee management",
    suite: "Enterprise Management",
    engine: "HRMS",
    description: "Employee records, onboarding and profile changes.",
    price_minor: 199900,
    currency: "INR",
    billing_period: "MONTHLY",
    active: true,
    available: true,
    modules: ["EMPLOYEE"],
    dependencies: [],
    version: 3,
  },
  {
    service_code: "LEAVE_MANAGEMENT",
    name: "Leave management",
    suite: "Enterprise Management",
    engine: "HRMS",
    description: "Leave requests and reviewed policies.",
    price_minor: 50000,
    currency: "INR",
    billing_period: "MONTHLY",
    active: true,
    available: true,
    modules: ["LEAVE", "LEAVE_POLICY"],
    dependencies: ["EMPLOYEE_MANAGEMENT"],
    version: 2,
  },
  {
    service_code: "PLANNED_OPERATIONS",
    name: "Operations preview",
    suite: "Operations",
    engine: "Operations",
    description: "A planned capability, unavailable for registration.",
    price_minor: 0,
    currency: "INR",
    billing_period: "MONTHLY",
    active: true,
    available: false,
    modules: [],
    dependencies: [],
    version: 1,
  },
];
const catalog: ServiceCatalog = {
  currency: "INR",
  billing_period: "MONTHLY",
  payment_mode: "MANUAL_VERIFICATION",
  pricing_status: "DEVELOPMENT_REFERENCE",
  services,
};
const companies: CompanySummary[] = [
  {
    company_id: acaciaId,
    reference: "COS-TEST-001",
    company_name: "Synthetic Acacia Foods",
    email: "owner@acacia.invalid",
    scope_id: null,
    status: "PAYMENT_REVIEW",
    requested_services: ["EMPLOYEE_MANAGEMENT", "LEAVE_MANAGEMENT"],
    active_services: [],
    total_minor: 249975,
    currency: "INR",
    created_at: timestamp,
    pending_configuration_requests: 1,
  },
  {
    company_id: brambleId,
    reference: "COS-TEST-002",
    company_name: "Synthetic Bramble Kitchens",
    email: "owner@bramble.invalid",
    scope_id: "SYNTHETIC_BRAMBLE",
    status: "ACTIVE",
    requested_services: ["EMPLOYEE_MANAGEMENT"],
    active_services: ["EMPLOYEE_MANAGEMENT"],
    total_minor: 199900,
    currency: "INR",
    created_at: timestamp,
    pending_configuration_requests: 1,
  },
];
const payments: PaymentReview[] = companies.map((company, index) => ({
  payment_id: "20000000-0000-0000-0000-00000000000" + (index + 1),
  company_id: company.company_id,
  company_name: company.company_name,
  reference: company.reference,
  payment_reference: "SYNTHETIC-TXN-00" + (index + 1),
  total_minor: company.total_minor,
  currency: company.currency,
  status: "PENDING_REVIEW",
  remarks: null,
  created_at: timestamp,
}));
const configurations: ConfigurationReview[] = companies.map(
  (company, index) => ({
    request_id: "30000000-0000-0000-0000-00000000000" + (index + 1),
    company_id: company.company_id,
    company_name: company.company_name,
    scope_id: company.scope_id ?? "SYNTHETIC_ACACIA",
    service_code: "EMPLOYEE_MANAGEMENT",
    service_name: "Employee management",
    kind: "FIELD_ADD",
    field: {
      technical_name: "uniform_size",
      label: "Uniform size",
      data_type: "text",
      sensitive: false,
    },
    reason: "Track uniform allocation for this company.",
    status: "PENDING_REVIEW",
    remarks: null,
    version: 1,
    created_at: timestamp,
  }),
);
const overview: PlatformOverview = {
  counts: {
    companies: 2,
    active_companies: 1,
    pending_payments: 2,
    pending_configuration_requests: 2,
  },
  companies,
  payments,
  configuration_requests: configurations,
  list_limit: 100,
  has_more_companies: false,
};
const adminSession: Session = {
  authenticated: true,
  username: "Synthetic platform administrator",
  roles: ["ADMIN"],
  scope_id: "SYNTHETIC_PLATFORM",
  can_print: false,
  platform_admin: true,
  company_portal: false,
  home_workspace: "PLATFORM",
};
const companySession: Session = {
  authenticated: true,
  username: "owner@bramble.invalid",
  roles: ["REGISTRAR"],
  scope_id: "SYNTHETIC_BRAMBLE",
  can_print: false,
  platform_admin: false,
  company_portal: true,
  home_workspace: "COMPANY",
};
const registration: CompanyRegistration = {
  company_id: acaciaId,
  reference: "COS-TEST-001",
  company_name: companies[0].company_name,
  status: "PENDING_PAYMENT",
  requested_services: ["EMPLOYEE_MANAGEMENT", "LEAVE_MANAGEMENT"],
  total_minor: 249975,
  currency: "INR",
  billing_period: "MONTHLY",
  registration_token: "synthetic-registration-recovery-key",
};
const companyWorkspace: CompanyWorkspace = {
  company: companies[1],
  services: [services[0]],
  configuration_requests: [configurations[1]],
  schemas: [
    {
      service_code: "EMPLOYEE_MANAGEMENT",
      version: 2,
      fields: [
        {
          technical_name: "uniform_size",
          label: "Uniform size",
          data_type: "text",
          sensitive: false,
        },
      ],
    },
  ],
  supported_field_types: ["text", "date", "number"],
};

type Reply = { status?: number; body?: unknown };
type Handler = (request: Request) => Reply | Promise<Reply>;
type Call = { method: string; path: string; body: unknown };
async function mockCommerce(
  page: Page,
  overrides: Record<string, Handler> = {},
  session = adminSession,
) {
  const calls: Call[] = [];
  const unexpected: string[] = [];
  const routes: Record<string, Handler> = {
    "GET /csrf": () => ({ body: { token: "synthetic-csrf-token" } }),
    "GET /session": () => ({ body: session }),
    "GET /services/catalog": () => ({ body: catalog }),
    "GET /platform/services": () => ({ body: services }),
    "GET /platform/overview": () => ({ body: overview }),
    "GET /company/workspace": () => ({ body: companyWorkspace }),
    "GET /modules": () => ({
      body: [
        {
          module_code: "EMPLOYEE",
          name: "Open employee directory",
          route: "/people/directory",
          enabled: true,
          audience: ["REGISTRAR"],
        },
        {
          module_code: "LEAVE",
          name: "Open leave requests",
          route: "/leave",
          enabled: true,
          audience: ["REGISTRAR"],
        },
        {
          module_code: "EMPLOYEE",
          name: "Unsafe external destination",
          route: "https://example.invalid",
          enabled: true,
          audience: ["REGISTRAR"],
        },
      ],
    }),
    ...overrides,
  };
  await page.route("**/api/v1/cos/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/cos", "");
    const method = request.method();
    calls.push({
      method,
      path,
      body: request.postData() ? request.postDataJSON() : null,
    });
    const handler = routes[method + " " + path];
    if (!handler) unexpected.push(method + " " + path);
    const reply = handler
      ? await handler(request)
      : {
          status: 500,
          body: {
            detail: "Unexpected synthetic API call: " + method + " " + path,
          },
        };
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: "application/json",
      body: reply.status === 204 ? undefined : JSON.stringify(reply.body ?? {}),
    });
  });
  return { calls, unexpected };
}
async function details(page: Page) {
  await page
    .getByLabel("Company name", { exact: true })
    .fill(companies[0].company_name);
  await page.getByLabel("Work email", { exact: true }).fill(companies[0].email);
  await page
    .getByLabel("Create password", { exact: false })
    .fill("Synthetic-password-2026!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-password-2026!");
  await page
    .getByRole("button", { name: "Choose services", exact: true })
    .click();
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("company registration includes dependencies, trusts the server quote, and waits for activation", async ({
  page,
}, testInfo) => {
  const mock = await mockCommerce(page, {
    "POST /companies/register": () => ({ body: registration }),
    ["POST /companies/" + acaciaId + "/payment"]: () => ({ body: payments[0] }),
    ["POST /companies/" + acaciaId + "/status"]: () => ({
      body: { ...registration, status: "ACTIVE", registration_token: null },
    }),
  });
  await page.goto("/company-register");
  await details(page);
  const employee = page.getByRole("checkbox", { name: /Employee management/ });
  const leave = page.getByRole("checkbox", { name: /Leave management/ });
  await leave.check();
  await expect(employee).toBeChecked();
  await expect(employee).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Operations preview/ }),
  ).toBeDisabled();
  const submit = page.getByRole("button", {
    name: "Register company",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I confirm the company details/ })
    .check();
  await submit.click();
  await expect(
    page.getByRole("heading", {
      name: "Company registered. Payment comes next.",
    }),
  ).toBeVisible();
  const registerCall = mock.calls.find(
    (call) => call.path === "/companies/register",
  );
  expect(registerCall?.body).toMatchObject({
    company_name: companies[0].company_name,
    email: companies[0].email,
    services: ["LEAVE_MANAGEMENT", "EMPLOYEE_MANAGEMENT"],
  });
  const quote = page
    .locator("dl > div")
    .filter({ has: page.getByText("Server-confirmed total", { exact: true }) });
  await expect(quote).toContainText("₹2,499.75");
  await expect(
    page.getByText(
      "It does not collect funds or connect to a payment gateway.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Payment reference", { exact: false })
    .fill("SYNTHETIC-TXN-001");
  await page
    .getByRole("button", { name: "Submit for verification", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your payment is under review." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to company" }),
  ).toHaveCount(0);
  expect(
    mock.calls.find((call) => call.path.endsWith("/payment"))?.body,
  ).toEqual({
    registration_token: registration.registration_token,
    payment_reference: "SYNTHETIC-TXN-001",
  });
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored).not.toContain(registration.registration_token);
  expect(stored).not.toContain("Synthetic-password-2026!");
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your company workspace is ready." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to company" }),
  ).toHaveAttribute("href", "/sign-in?next=%2Fcompany");
  await accessible(page);
  await page.screenshot({
    path: `tmp/commerce-registration-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect(mock.unexpected).toEqual([]);
});

test("catalogue failures can be retried and no service can register when the catalogue is empty", async ({
  page,
}) => {
  let unavailable = true;
  const mock = await mockCommerce(page, {
    "GET /services/catalog": () =>
      unavailable
        ? {
            status: 503,
            body: {
              error_code: "CATALOG_UNAVAILABLE",
              detail: "The service catalogue is temporarily unavailable.",
            },
          }
        : { body: { ...catalog, services: [] } },
  });
  await page.goto("/company-register");
  await details(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The service catalogue is temporarily unavailable.",
  );
  unavailable = false;
  await page.getByRole("button", { name: "Retry catalogue" }).click();
  await expect(
    page.getByText("No services are available for registration right now.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register company", exact: true }),
  ).toBeDisabled();
  expect(mock.calls.some((call) => call.path === "/companies/register")).toBe(
    false,
  );
  expect(mock.unexpected).toEqual([]);
});

test("platform company search and details preserve company context", async ({
  page,
}, testInfo) => {
  const mock = await mockCommerce(page);
  await page.goto("/platform/companies");
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  await page
    .getByRole("searchbox", { name: "Search companies" })
    .fill("bramble.invalid");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText(companies[1].company_name);
  await expect(table).not.toContainText(companies[0].company_name);
  await page
    .getByRole("button", { name: "View " + companies[1].company_name })
    .click();
  const dialog = page.getByRole("dialog", { name: companies[1].company_name });
  await expect(dialog).toContainText("owner@bramble.invalid");
  await expect(dialog).toContainText("Employee management");
  await expect(dialog).not.toContainText("Leave management");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View " + companies[1].company_name }),
  ).toBeFocused();
  await page
    .getByRole("searchbox", { name: "Search companies" })
    .fill("nonexistent-company");
  await expect(
    page.getByRole("heading", { name: "No matching company" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search companies" }).clear();
  await accessible(page);
  await page.screenshot({
    path: `tmp/commerce-platform-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect(mock.unexpected).toEqual([]);
});

test("payment review shows the exact company amount and sends one confirmed decision", async ({
  page,
}) => {
  let reviewed = false;
  const mock = await mockCommerce(page, {
    "GET /platform/overview": () => ({
      body: reviewed
        ? {
            ...overview,
            payments: payments.map((payment) =>
              payment.company_id === acaciaId
                ? {
                    ...payment,
                    status: "APPROVED",
                    remarks: "Verified synthetic reference and exact amount.",
                  }
                : payment,
            ),
          }
        : overview,
    }),
    "POST /platform/payments/20000000-0000-0000-0000-000000000001/review":
      () => {
        reviewed = true;
        return { status: 204 };
      },
  });
  await page.goto("/platform/payments");
  await page
    .getByRole("combobox", { name: "Company", exact: true })
    .selectOption(acaciaId);
  await expect(page.getByRole("table")).not.toContainText(
    companies[1].company_name,
  );
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review payment & activation",
  });
  await expect(dialog).toContainText(companies[0].company_name);
  await expect(dialog).toContainText("SYNTHETIC-TXN-001");
  await expect(dialog).toContainText("₹2,499.75");
  await expect(
    dialog.getByRole("button", { name: "Confirm approval" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Review notes")
    .fill("Verified synthetic reference and exact amount.");
  await dialog
    .getByRole("checkbox", {
      name: "I confirm this decision for " + companies[0].company_name + ".",
    })
    .check();
  await accessible(page);
  await dialog.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Payment approved for" }),
  ).toContainText("Payment approved for " + companies[0].company_name);
  const calls = mock.calls.filter((call) => call.path.endsWith("/review"));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    method: "POST",
    path: "/platform/payments/20000000-0000-0000-0000-000000000001/review",
    body: {
      decision: "APPROVE",
      remarks: "Verified synthetic reference and exact amount.",
    },
  });
  await expect(page.getByRole("table")).toContainText("Approved");
  expect(mock.unexpected).toEqual([]);
});

test("configuration review retains company and service context after a conflict", async ({
  page,
}) => {
  let reviewedElsewhere = false;
  const mock = await mockCommerce(page, {
    "GET /platform/overview": () => ({
      body: reviewedElsewhere
        ? {
            ...overview,
            configuration_requests: configurations.map((request) =>
              request.company_id === brambleId
                ? {
                    ...request,
                    status: "APPROVED",
                    remarks: "Reviewed by another administrator.",
                  }
                : request,
            ),
          }
        : overview,
    }),
    "POST /platform/configuration-requests/30000000-0000-0000-0000-000000000002/review":
      () => {
        reviewedElsewhere = true;
        return {
          status: 409,
          body: {
            error_code: "CONFIGURATION_ALREADY_REVIEWED",
            detail: "This request has already been reviewed.",
          },
        };
      },
  });
  await page.goto("/platform/configuration");
  await page
    .getByRole("combobox", { name: "Company", exact: true })
    .selectOption(brambleId);
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review company configuration",
  });
  await expect(dialog).toContainText(companies[1].company_name);
  await expect(dialog).toContainText("Employee management");
  await expect(dialog).toContainText("Uniform size (uniform_size) · text");
  await expect(dialog).toContainText(
    "Track uniform allocation for this company.",
  );
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("REJECT");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Confirm rejection" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Review notes")
    .fill("Please clarify the uniform size format.");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "This request has already been reviewed.",
  );
  await expect(dialog.getByLabel("Review notes")).toHaveValue(
    "Please clarify the uniform size format.",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("table")).toContainText(
    "Reviewed by another administrator.",
  );
  await expect(
    page.getByRole("button", { name: "Review change", exact: true }),
  ).toHaveCount(0);
  expect(
    mock.calls
      .filter((call) => call.path.endsWith("/review"))
      .map((call) => call.body),
  ).toEqual([
    { decision: "REJECT", remarks: "Please clarify the uniform size format." },
  ]);
  expect(mock.unexpected).toEqual([]);
});

test("company accounts cannot fetch the platform register and anonymous accounts return safely to sign in", async ({
  page,
}) => {
  let authenticated = true;
  const mock = await mockCommerce(page, {
    "GET /session": () => ({
      body: authenticated
        ? companySession
        : { ...companySession, authenticated: false },
    }),
  });
  await page.goto("/platform/payments");
  await expect(
    page.getByRole("heading", {
      name: "Platform administrator access required.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open company workspace" }),
  ).toHaveAttribute("href", "/company");
  expect(mock.calls.some((call) => call.path.startsWith("/platform/"))).toBe(
    false,
  );
  await expect(page.getByRole("table")).toHaveCount(0);
  authenticated = false;
  await page.goto("/platform/configuration");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplatform%2Fconfiguration$/);
  expect(mock.calls.some((call) => call.path.startsWith("/platform/"))).toBe(
    false,
  );
  expect(mock.unexpected).toEqual([]);
});

test("authenticated sign-in resumes the correct workspace and rejects external return destinations", async ({
  page,
}) => {
  let session = adminSession;
  const mock = await mockCommerce(page, {
    "GET /session": () => ({ body: session }),
    "GET /onboarding/schema": () => ({
      body: {
        configuration_version: 1,
        additional_fields: [],
        scope_id: companySession.scope_id,
        local_environment: true,
      },
    }),
    "GET /onboarding/drafts": () => ({ body: [] }),
    "GET /onboarding/employees": () => ({
      body: { items: [], next_cursor: null },
    }),
    "GET /onboarding/me": () => ({
      body: {
        employee_id: brambleId,
        employee_code: "SYNTHETIC-EMP-001",
        display_name: "Synthetic employee",
        version: 1,
        work_email: null,
        work_email_status: null,
        profile: {
          values: { name: "Synthetic employee" },
          groups: {},
          same_address: false,
        },
        documents: [],
        created_at: timestamp,
      },
    }),
  });
  await page.goto("/sign-in?next=//example.invalid");
  await expect(page).toHaveURL(/\/platform$/);
  await expect(
    page.getByRole("heading", { name: "Your platform, at a glance." }),
  ).toBeVisible();
  await page.goto("/sign-in?next=%2Fplatform%2Fpayments");
  await expect(page).toHaveURL(/\/platform\/payments$/);
  await expect(
    page.getByRole("heading", { name: "Payment reviews", exact: true }),
  ).toBeVisible();
  session = companySession;
  await page.goto("/sign-in?next=https%3A%2F%2Fexample.invalid");
  await expect(page).toHaveURL(/\/company$/);
  await expect(
    page.getByRole("heading", { name: companies[1].company_name, exact: true }),
  ).toBeVisible();
  await page.goto("/sign-up");
  await expect(page).toHaveURL(/\/company$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/company$/);
  session = {
    ...companySession,
    username: "Synthetic HR",
    home_workspace: "HR",
  };
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/people$/);
  await expect(
    page.getByRole("heading", { name: "HR workspace", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/people$/);
  await page.goto("/sign-in?next=%2Fplatform%2Fpayments");
  await expect(page).toHaveURL(/\/people$/);
  await page.goto("/sign-in?next=%2Fpeople%2Fdirectory");
  await expect(page).toHaveURL(/\/people\/directory$/);
  session = {
    ...companySession,
    roles: ["EMPLOYEE"],
    home_workspace: "EMPLOYEE",
    company_portal: false,
  };
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/people\/me$/);
  await expect(
    page.getByRole("heading", { name: "My employee profile", exact: true }),
  ).toBeVisible();
  await page.goto("/sign-in?next=%2Fcompany");
  await expect(page).toHaveURL(/\/people\/me$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/people\/me$/);
  expect(mock.unexpected).toEqual([]);
});

test("company manager has company navigation and HR config stays inside the HR workspace", async ({
  page,
}, testInfo) => {
  let session = companySession;
  let unavailable = true;
  let submitted: ConfigurationReview | null = null;
  let releaseWorkspace: () => void = () => {};
  const workspaceReady = new Promise<void>((resolve) => {
    releaseWorkspace = resolve;
  });
  const mock = await mockCommerce(page, {
    "GET /session": () => ({ body: session }),
    "GET /onboarding/schema": () => ({
      body: {
        configuration_version: 1,
        additional_fields: [],
        scope_id: companySession.scope_id,
        local_environment: true,
      },
    }),
    "GET /onboarding/drafts": () => ({ body: [] }),
    "GET /onboarding/employees": () => ({
      body: { items: [], next_cursor: null },
    }),
    "GET /company/workspace": async () => {
      await workspaceReady;
      return unavailable
        ? {
            status: 503,
            body: {
              error_code: "WORKSPACE_UNAVAILABLE",
              detail: "The company field schema is temporarily unavailable.",
            },
          }
        : {
            body: {
              ...companyWorkspace,
              configuration_requests: submitted
                ? [...companyWorkspace.configuration_requests, submitted]
                : companyWorkspace.configuration_requests,
            },
          };
    },
    "POST /company/configuration-requests": (request) => {
      const input = request.postDataJSON();
      submitted = {
        ...configurations[1],
        request_id: "30000000-0000-0000-0000-000000000099",
        ...input,
        status: "PENDING_REVIEW",
      };
      return { status: 202, body: submitted };
    },
  });
  await page.goto("/people");
  await expect(page).toHaveURL(/\/people\/directory$/);
  await expect(page.getByRole("banner")).toContainText("Company admin");
  const navigation = page.getByRole("navigation", {
    name: "Employee Management",
  });
  await expect(
    navigation.getByRole("link", { name: "Company overview", exact: true }),
  ).toHaveAttribute("href", "/company");
  await expect(
    navigation.getByRole("link", { name: "HR overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("link", { name: "Register employee", exact: true }),
  ).toHaveCount(0);
  await accessible(page);
  await page.screenshot({
    path: `tmp/company-manager-people-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  session = {
    ...companySession,
    username: "Synthetic company HR",
    home_workspace: "HR",
  };
  await page.goto("/people");
  await expect(page.getByRole("banner")).toContainText(" · HR");
  const formLink = navigation.getByRole("link", {
    name: "Form configuration",
    exact: true,
  });
  await expect(formLink).toHaveAttribute("href", "/people/configuration");
  await expect(
    navigation.getByRole("link", { name: "Company workspace", exact: true }),
  ).toHaveCount(0);
  await formLink.click();
  await expect(
    page.getByRole("region", { name: "Loading workspace" }),
  ).toHaveAttribute("aria-busy", "true");
  releaseWorkspace();
  await expect(page).toHaveURL(/\/people\/configuration$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The company field schema is temporarily unavailable.",
  );
  unavailable = false;
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approved service fields", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Form configuration", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await accessible(page);
  await page.screenshot({
    path: `tmp/hr-form-configuration-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Request a field", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request a company field" });
  await dialog
    .getByLabel("Field label", { exact: true })
    .fill("Badge allocation");
  await dialog
    .getByRole("textbox", { name: /^Technical field name/ })
    .fill("badge_allocation");
  await dialog
    .getByLabel("Business reason", { exact: true })
    .fill("Track synthetic employee badge allocation.");
  await dialog
    .getByRole("checkbox", { name: /I confirm this request/ })
    .check();
  await accessible(page);
  await dialog
    .getByRole("button", { name: "Submit field request", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/people\/configuration$/);
  await expect(page.getByRole("main")).toContainText("Badge allocation");
  expect(
    mock.calls.filter(
      (call) =>
        call.method === "POST" &&
        call.path === "/company/configuration-requests",
    ),
  ).toHaveLength(1);
  expect(
    mock.calls.some(
      (call) => call.path.startsWith("/platform/") || call.path === "/requests",
    ),
  ).toBe(false);
  expect(mock.unexpected).toEqual([]);
});

test("workspace loading and bounded results stay visible while the catalogue can recover independently", async ({
  page,
}, testInfo) => {
  let releaseOverview: () => void = () => {};
  const overviewReady = new Promise<void>((resolve) => {
    releaseOverview = resolve;
  });
  let catalogueUnavailable = true;
  const mock = await mockCommerce(page, {
    "GET /platform/overview": async () => {
      await overviewReady;
      return {
        body: {
          ...overview,
          counts: { ...overview.counts, companies: 205 },
          has_more_companies: true,
          list_limit: 2,
        },
      };
    },
    "GET /platform/services": () =>
      catalogueUnavailable
        ? {
            status: 503,
            body: {
              error_code: "CATALOG_UNAVAILABLE",
              detail: "The service catalogue is temporarily unavailable.",
            },
          }
        : { body: services },
  });
  await page.goto("/platform/companies");
  await expect(
    page.getByRole("region", { name: "Loading workspace" }),
  ).toHaveAttribute("aria-busy", "true");
  await page.screenshot({
    path: `tmp/commerce-loading-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  releaseOverview();
  await expect(
    page.getByText("Showing the latest 2 companies.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(3);
  await page.screenshot({
    path: `tmp/commerce-partial-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.goto("/platform/services");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The service catalogue is temporarily unavailable.",
  );
  catalogueUnavailable = false;
  await page
    .getByRole("button", { name: "Reload catalogue", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText(services[0].description);
  await accessible(page);
  expect(mock.unexpected).toEqual([]);
});

test("company field requests use subscribed services and remain separate from approved metadata", async ({
  page,
}, testInfo) => {
  let submitted = false;
  const requested = {
    ...configurations[1],
    request_id: "30000000-0000-0000-0000-000000000003",
    field: {
      technical_name: "badge_reference",
      label: "Badge reference",
      data_type: "text",
      sensitive: true,
    },
    reason: "Track the company-issued employee badge.",
  };
  const mock = await mockCommerce(
    page,
    {
      "GET /company/workspace": () => ({
        body: submitted
          ? {
              ...companyWorkspace,
              configuration_requests: [
                ...companyWorkspace.configuration_requests,
                requested,
              ],
            }
          : companyWorkspace,
      }),
      "POST /company/configuration-requests": () => {
        submitted = true;
        return { body: requested };
      },
    },
    companySession,
  );
  await page.goto("/company");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    companies[1].company_name,
  );
  await expect(
    page.getByRole("link", { name: "Open employee directory" }),
  ).toHaveAttribute("href", "/people/directory");
  await expect(
    page.getByRole("link", { name: "Open leave requests" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Unsafe external destination" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Request a field", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request a company field" });
  const service = dialog.getByRole("combobox", {
    name: "Subscribed service",
    exact: true,
  });
  await expect(service.locator("option")).toHaveCount(1);
  await expect(service).toHaveValue("EMPLOYEE_MANAGEMENT");
  await expect(
    dialog.getByRole("button", { name: "Submit field request" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Field label", { exact: true })
    .fill(" Badge reference ");
  const technical = dialog.getByLabel("Technical field name", { exact: false });
  await technical.fill("Bad Field");
  await dialog
    .getByRole("combobox", { name: "Field type", exact: true })
    .selectOption("text");
  await dialog
    .getByRole("checkbox", {
      name: "This field contains sensitive information.",
    })
    .check();
  await dialog
    .getByLabel("Business reason", { exact: true })
    .fill("Track the company-issued employee badge.");
  await dialog
    .getByRole("checkbox", { name: /I confirm this request/ })
    .check();
  await dialog.getByRole("button", { name: "Submit field request" }).click();
  expect(
    await technical.evaluate(
      (input) => (input as HTMLInputElement).validity.patternMismatch,
    ),
  ).toBe(true);
  expect(
    mock.calls.filter(
      (call) =>
        call.method === "POST" &&
        call.path === "/company/configuration-requests",
    ),
  ).toHaveLength(0);
  await technical.fill("badge_reference");
  await accessible(page);
  await page.screenshot({
    path: `tmp/commerce-company-field-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await dialog.getByRole("button", { name: "Submit field request" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your field request" }),
  ).toContainText("only after administrator approval");
  const body = mock.calls.find(
    (call) =>
      call.method === "POST" && call.path === "/company/configuration-requests",
  )?.body;
  expect(body).toEqual({
    service_code: "EMPLOYEE_MANAGEMENT",
    kind: "FIELD_ADD",
    field: requested.field,
    reason: requested.reason,
    schema_version: 2,
  });
  const approved = page
    .getByRole("heading", { name: "Approved service fields", exact: true })
    .locator("..");
  await expect(approved).toContainText("Uniform size");
  await expect(approved).not.toContainText("Badge reference");
  const history = page
    .getByRole("heading", {
      name: "Configuration request history",
      exact: true,
    })
    .locator("..");
  await expect(history).toContainText("Badge reference");
  await expect(history).toContainText("Pending review");
  expect(mock.unexpected).toEqual([]);
});

test("public registration and homepage have no internal architecture destinations", async ({
  page,
}) => {
  const mock = await mockCommerce(page);
  for (const path of ["/", "/company-register"]) {
    await page.goto(path);
    const internal = await page
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href) =>
            /github|governance|architecture|blueprint|drive\.google|docs\.google/i.test(
              href ?? "",
            ),
          ),
      );
    expect(internal).toEqual([]);
  }
  expect(mock.unexpected).toEqual([]);
});

test("an approved field change preserves identifiers and stays pending at the recorded schema version", async ({
  page,
}) => {
  const proposed = {
    ...configurations[1],
    request_id: "30000000-0000-0000-0000-000000000004",
    kind: "FIELD_UPDATE",
    field: {
      technical_name: "uniform_size",
      label: "Uniform fit",
      data_type: "text",
      sensitive: false,
    },
    reason: "Clarify the label used for uniform allocation.",
  };
  const mock = await mockCommerce(
    page,
    { "POST /company/configuration-requests": () => ({ body: proposed }) },
    companySession,
  );
  await page.goto("/company/configuration");
  await page
    .getByRole("button", { name: "Request a field", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request a company field" });
  await dialog
    .getByRole("combobox", { name: "Request type", exact: true })
    .selectOption("FIELD_UPDATE");
  const technical = dialog.getByRole("textbox", {
    name: /^Technical field name/,
  });
  await expect(technical).toHaveValue("uniform_size");
  await expect(technical).toHaveAttribute("readonly", "");
  await expect(
    dialog.getByRole("combobox", { name: "Field type", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText("schema version 2");
  await dialog.getByLabel("Field label", { exact: true }).fill("Uniform fit");
  await expect(
    dialog.getByRole("checkbox", {
      name: "This field contains sensitive information.",
    }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Business reason", { exact: true })
    .fill(proposed.reason);
  await dialog
    .getByRole("checkbox", { name: /I confirm this request/ })
    .check();
  await dialog.getByRole("button", { name: "Submit field request" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your field request" }),
  ).toContainText("only after administrator approval");
  expect(
    mock.calls.find(
      (call) =>
        call.method === "POST" &&
        call.path === "/company/configuration-requests",
    )?.body,
  ).toEqual({
    service_code: "EMPLOYEE_MANAGEMENT",
    kind: "FIELD_UPDATE",
    field: proposed.field,
    reason: proposed.reason,
    schema_version: 2,
  });
  const approved = page
    .getByRole("heading", { name: "Approved service fields", exact: true })
    .locator("..");
  await expect(approved).toContainText("Uniform size");
  await expect(approved).not.toContainText("Uniform fit");
  expect(mock.unexpected).toEqual([]);
});
