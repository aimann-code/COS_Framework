import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const secrets = JSON.parse(
  readFileSync(".local/backend-secrets.json", "utf8").replace(/^\uFEFF/, ""),
);
async function signIn(page: Page, username: string) {
  await page.goto("/");
  await page.getByLabel("Email or username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(secrets[`COS_${username.toUpperCase()}_PASSWORD`]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Connected workspace", { exact: true }),
  ).toBeVisible();
}
test("registration survives reload, separate admin approves, viewer sees masked result", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, "registrar");
  const suffix = Date.now().toString();
  const name = `Synthetic E2E ${suffix}`;
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await page.getByLabel("Employee name", { exact: false }).fill(name);
  await page.getByLabel("EMP ID generation mode").selectOption("AUTO");
  await page.getByLabel("Father’s name").fill("Synthetic Parent");
  await page.getByLabel("Nationality", { exact: false }).selectOption("India");
  await page.getByLabel("National ID type").selectOption("Passport");
  await page
    .getByLabel("ID number", { exact: false })
    .fill(`SYNTHETIC-${suffix}`);
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for approval" }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: /^(My requests|Review requests)/ })
    .click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Pending approval",
  );
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, "admin");
  await admin
    .locator(".sidebar")
    .getByRole("link", { name: /^(My requests|Review requests)/ })
    .click();
  await admin
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button")
    .click();
  await expect(admin.getByRole("dialog")).not.toContainText(
    `SYNTHETIC-${suffix}`,
  );
  await admin
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(admin.getByRole("row").filter({ hasText: name })).toContainText(
    "Completed",
    { timeout: 20000 },
  );
  const viewContext = await browser.newContext();
  const viewer = await viewContext.newPage();
  await signIn(viewer, "viewer");
  await expect(
    viewer.getByRole("button", { name: "Register employee", exact: true }),
  ).toHaveCount(0);
  await viewer
    .getByRole("link", { name: "Employee details", exact: true })
    .click();
  await viewer
    .getByRole("textbox", { name: "Search employees by ID or name" })
    .fill(name);
  await viewer
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(viewer.locator(".print-area")).toContainText("LOCAL-");
  await expect(viewer.locator(".print-area")).not.toContainText(
    `SYNTHETIC-${suffix}`,
  );
  await expect(
    viewer.getByRole("button", { name: "Print details", exact: true }),
  ).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "Request update", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await adminContext.close();
  await viewContext.close();
});
test("favorite persists through refresh and sign out clears workspace", async ({
  page,
}) => {
  await signIn(page, "registrar");
  const add = page.getByRole("button", {
    name: "Add Employee details to favorites",
    exact: true,
  });
  if (await add.count()) await add.click();
  await expect(
    page.getByRole("button", {
      name: "Remove Employee details from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove Employee details from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByLabel("Email or username", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Email or username", { exact: true }),
  ).toBeVisible();
});

test("signup stays pending until admin approves, then the assigned account can sign in", async ({
  page,
  browser,
}) => {
  const email = `synthetic-account-${Date.now()}@example.test`;
  const password = "Synthetic access passphrase 2026";
  await page.goto("/sign-up");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Synthetic Access Member");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different passphrase");
  await page
    .getByRole("button", {
      name: "Create account & request access",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Your passwords do not match.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", {
      name: "Create account & request access",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Request received.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to sign in", exact: true })
    .click();
  await page.getByLabel("Email or username", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-error[role=alert]")).toContainText(
    "administrator approval",
  );
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, "admin");
  await admin
    .getByRole("button", { name: "Account access", exact: true })
    .click();
  await admin
    .getByRole("row")
    .filter({ hasText: email })
    .getByRole("button", { name: "Review access", exact: true })
    .click();
  await admin.getByLabel("Assign access").selectOption("VIEWER");
  await admin
    .getByRole("button", { name: "Approve access", exact: true })
    .click();
  await expect(admin.locator(".info-callout[role=status]")).toContainText(
    "Account approved.",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Connected workspace", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByRole("button", { name: "Register employee", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Account access", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Connected workspace", { exact: true }),
  ).toBeVisible();
  await adminContext.close();
});
test("account entry is accessible and fits mobile with working password visibility", async ({
  page,
}) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic visibility phrase");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await page.getByText("Forgot your password?", { exact: true }).click();
  await expect(
    page.getByText(/Contact your workspace administrator to restore access/),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/auth-sign-in-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(page).toHaveURL("/sign-up");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", {
      name: "Your next chapter starts here.",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/auth-sign-up-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Create account & request access",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Enter your full name.", { exact: true }),
  ).toBeVisible();
});

test("admin overview prioritizes reviews and remains usable on short and mobile screens", async ({
  page,
}) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await signIn(page, "admin");
  await expect(
    page.getByRole("heading", { name: "Workspace overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Register employee", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Employee registration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Illustrative data · changes stay in memory and reset on refresh.",
      { exact: false },
    ),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/admin-after-desktop.png",
    fullPage: true,
  });
  const favorite = page.getByRole("button", {
    name: "Add Configuration to favorites",
    exact: true,
  });
  if (await favorite.count()) await favorite.click();
  await expect(
    page.getByRole("button", {
      name: "Remove Configuration from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const recent = page
    .locator(".admin-activity")
    .getByRole("button", { name: /^Open request/ })
    .first();
  if (await recent.count()) {
    await recent.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page
    .locator(".sidebar")
    .getByRole("link", { name: /^Review requests/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review queue", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configuration", exact: true }).click();
  await expect(
    page.getByText("System admin only", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/admin-configuration.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Account access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Account access", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 620 });
  await expect(
    page.getByRole("button", { name: "Help & guidance", exact: false }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Account approvals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Account access", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/admin-after-mobile.png",
    fullPage: true,
  });
});

test("real URLs support direct links, reload, and browser history for admin", async ({
  page,
}) => {
  await signIn(page, "admin");
  const employees = page
    .locator(".sidebar")
    .getByRole("link", { name: "Employee details", exact: true });
  await expect(employees).toHaveAttribute("href", "/employees");
  await employees.click();
  await expect(page).toHaveURL("/employees");
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Configuration", exact: true })
    .click();
  await expect(page).toHaveURL("/configuration");
  await page.reload();
  await expect(
    page.getByText("System admin only", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/employees");
  await expect(
    page.getByRole("heading", { name: "Employee directory", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL("/configuration");
  await page
    .getByRole("button", { name: "Account access", exact: true })
    .click();
  await expect(page).toHaveURL("/accounts");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Pending account requests",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/requests");
  const first = page.getByRole("button", { name: /^View request / }).first();
  if (await first.count()) {
    await first.click();
    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    const deep = page.url();
    await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/requests");
    await page.goBack();
    await expect(page).toHaveURL(deep);
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  await page.goto("/help");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Refreshing clears your changes",
  );
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/admin");
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "This page isn’t here.", exact: true }),
  ).toBeVisible();
});

test("registrar navigation retains drafts, opens import URLs, and reloads employee details", async ({
  page,
}) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await signIn(page, "registrar");
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Employee registration", exact: true })
    .click();
  await expect(page).toHaveURL("/employees/new");
  await page
    .getByLabel("Employee name", { exact: false })
    .fill("Synthetic Navigation Draft");
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Employee details", exact: true })
    .click();
  await expect(page).toHaveURL("/employees");
  await page.goBack();
  await expect(page).toHaveURL("/employees/new");
  await expect(page.getByLabel("Employee name", { exact: false })).toHaveValue(
    "Synthetic Navigation Draft",
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/registrar-registration.png",
    fullPage: true,
  });
  await page.goto("/imports/csv");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/employees/new");
  await page.goto("/imports/google-sheets");
  await expect(page.getByRole("dialog")).toContainText(
    /required|configure|authorised/i,
  );
  await page.keyboard.press("Escape");
  await page.goto("/employees");
  const view = page
    .getByRole("button", { name: "View details", exact: true })
    .first();
  if (await view.count()) {
    await view.click();
    await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}$/);
    const detail = page.url();
    await expect(page.locator(".print-area")).toBeVisible();
    await page.reload();
    await expect(page.locator(".print-area")).toBeVisible();
    await page
      .getByRole("button", { name: "Request update", exact: true })
      .click();
    await expect(page).toHaveURL(`${detail}/edit`);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Request employee update",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Employee name", { exact: false }),
    ).not.toHaveValue("");
  }
  await page.goto("/configuration");
  await expect(
    page.getByRole("heading", { name: "Access is restricted.", exact: true }),
  ).toBeVisible();
});

test("protected deep links return through login, viewer routes stay restricted, and proxy uses one origin", async ({
  page,
}) => {
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Femployees/);
  await page.getByLabel("Email or username", { exact: true }).fill("viewer");
  await page
    .getByLabel("Password", { exact: true })
    .fill(secrets.COS_VIEWER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/employees");
  await expect(
    page.getByRole("heading", { name: "Employee directory", exact: true }),
  ).toBeVisible();
  const health = await page.request.get("/api/v1/cos/health");
  expect(health.ok()).toBe(true);
  const session = await page.request.get("/api/v1/cos/session");
  expect((await session.json()).authenticated).toBe(true);
  for (const path of [
    "/configuration",
    "/employees/new",
    "/accounts",
    "/imports/csv",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Access is restricted.", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/employees");
  await expect(
    page.getByRole("heading", { name: "Employee details", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/viewer-directory-mobile.png",
    fullPage: true,
  });
});

test("CSV validation errors stay visible, approved imports and employee updates complete end to end", async ({
  page,
  browser,
}) => {
  await signIn(page, "registrar");
  const nonce = Date.now().toString();
  const existing = (
    await (await page.request.get("/api/v1/cos/employees?limit=1")).json()
  ).items[0];
  const csv = (employeeId: string, name: string) =>
    `employee_name,empid_entry_mode,sys_emp_id,father_name,nationality_id,national_id_type_id,id_number\n${name},MANUAL,${employeeId},Synthetic CSV Parent,India,Passport,SYNTHETICCSV${nonce}\n`;
  await page.goto("/imports/csv");
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      csv(existing.sys_emp_id, `Synthetic Duplicate ${nonce}`),
    ),
  });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Row 2",
  );
  const name = `Synthetic Import ${nonce}`;
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv(`00${nonce}`, name)),
  });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    /submitted for approval/i,
  );
  await page.keyboard.press("Escape");
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, "admin");
  await admin.goto("/requests");
  const batch = admin
    .getByRole("row")
    .filter({ hasText: "CSV import" })
    .filter({ hasText: "Pending approval" })
    .first();
  await batch.getByRole("button").click();
  await admin
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect
    .poll(async () => {
      const rows = (
        await (
          await page.request.get(
            `/api/v1/cos/employees?search=${encodeURIComponent(name)}`,
          )
        ).json()
      ).items;
      return rows.length;
    })
    .toBe(1);
  const employee = (
    await (
      await page.request.get(
        `/api/v1/cos/employees?search=${encodeURIComponent(name)}`,
      )
    ).json()
  ).items[0];
  await page.goto(`/employees/${employee.employee_key}/edit`);
  await page
    .getByLabel("Employee name", { exact: false })
    .fill(`${name} Updated`);
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for approval", exact: true }),
  ).toBeVisible();
  await admin.goto("/requests");
  await admin
    .getByRole("row")
    .filter({ hasText: `${name} Updated` })
    .getByRole("button")
    .click();
  await admin
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await page.request.get(
        `/api/v1/cos/employees/${employee.employee_key}`,
      );
      return (await r.json()).record_version;
    })
    .toBe(2);
  await page.goto(`/employees/${employee.employee_key}`);
  await expect(page.locator(".print-area")).toContainText(`${name} Updated`);
  await expect(page.locator(".print-area")).toContainText(`00${nonce}`);
  await adminContext.close();
});

test("configuration self-approval denial is visible and a separate reviewer can reject the proposal", async ({
  page,
  browser,
}) => {
  await signIn(page, "admin");
  await page.goto("/configuration");
  const config = await (
    await page.request.get("/api/v1/cos/components/EMP_Reg/configuration")
  ).json();
  await page
    .getByRole("checkbox", { name: "Enable Date of birth", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit configuration", exact: true })
    .click();
  await expect(page).toHaveURL("/requests");
  const response = await page.request.get("/api/v1/cos/requests?limit=100");
  const pending = (await response.json()).items.find(
    (r: { operation: string; status: string; actor_id: string }) =>
      r.operation === "CONFIGURATION" &&
      r.status === "PENDING_APPROVAL" &&
      r.actor_id === "admin",
  );
  expect(pending).toBeTruthy();
  await page.goto(`/requests/${pending.request_id}`);
  await page
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    /different administrator/,
  );
  const context = await browser.newContext();
  const reviewer = await context.newPage();
  await signIn(reviewer, "reviewer");
  await reviewer.goto(`/requests/${pending.request_id}`);
  await reviewer
    .getByLabel("Review note", { exact: true })
    .fill(
      "Synthetic UI check: reject proposal and preserve the active configuration.",
    );
  await reviewer
    .getByRole("button", { name: "Reject request", exact: true })
    .click();
  await expect(reviewer).toHaveURL("/requests");
  const current = await (
    await page.request.get("/api/v1/cos/components/EMP_Reg/configuration")
  ).json();
  expect(current.version).toBe(config.version);
  await context.close();
});

test("refresh keeps the admin URL and never renders the sign-in form or layout", async ({
  page,
}) => {
  await signIn(page, "admin");
  await expect(page).toHaveURL("/admin");
  await page.route("**/api/v1/cos/session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".workspace-loading")).toBeVisible();
  await expect(page.locator(".auth-layout")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL("/admin");
  await expect(
    page.getByRole("heading", { name: "Workspace overview", exact: true }),
  ).toBeVisible();
  await page.goto("/employees");
  await expect(
    page.getByRole("heading", { name: "Employee directory", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL("/employees");
  await expect(
    page.getByRole("heading", { name: "Employee directory", exact: true }),
  ).toBeVisible();
});

test("a session connection failure keeps the route and offers retry instead of signing out", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route("**/api/v1/cos/session", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/admin");
  await expect(page.locator(".auth-layout")).toHaveCount(0);
  await page.unroute("**/api/v1/cos/session");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace overview", exact: true }),
  ).toBeVisible();
});

test("stale CSRF retries once while a role denial is never retried", async ({
  page,
}) => {
  await signIn(page, "registrar");
  let attempts = 0;
  let denied = false;
  await page.route("**/api/v1/cos/me/favorites/EMP_Details", async (route) => {
    attempts++;
    if (denied || attempts === 1)
      return route.fulfill({
        status: 403,
        contentType: "application/problem+json",
        body: JSON.stringify({
          error_code: denied ? "FORBIDDEN" : "CSRF_INVALID",
        }),
      });
    await route.continue();
  });
  const toggle = page.getByRole("button", {
    name: /^(Add|Remove) Employee details (to|from) favorites$/,
  });
  await toggle.click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator(".toast-error")).toHaveCount(0);
  denied = true;
  await toggle.click();
  await expect(page.locator(".toast-error")).toBeVisible();
  expect(attempts).toBe(3);
});

test("an older background response cannot replace newer employee data", async ({
  page,
}) => {
  await signIn(page, "viewer");
  const seed = (
    await (await page.request.get("/api/v1/cos/employees?limit=1")).json()
  ).items[0];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/api/v1/cos/employees?**", async (route) => {
    const n = ++reads;
    if (n === 1) await held;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...seed,
            employee_name:
              n === 1
                ? "Synthetic Older Response"
                : "Synthetic Current Response",
          },
        ],
        next_cursor: null,
      }),
    });
  });
  await page.goto("/employees");
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(
    page.getByText("Synthetic Current Response", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("Synthetic Older Response", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Synthetic Current Response", { exact: true }),
  ).toBeVisible();
});

test("a delayed search page cannot append records to a different search", async ({
  page,
}) => {
  await signIn(page, "viewer");
  const seed = (
    await (await page.request.get("/api/v1/cos/employees?limit=1")).json()
  ).items[0];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let paging = false;
  await page.route("**/api/v1/cos/employees?**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("search");
    if (!query) return route.continue();
    if (url.searchParams.has("after")) {
      paging = true;
      await held;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...seed,
            employee_key:
              query === "Alpha"
                ? "11111111-1111-4111-8111-111111111111"
                : "22222222-2222-4222-8222-222222222222",
            employee_name: `Synthetic ${query}`,
          },
        ],
        next_cursor: query === "Alpha" ? seed.employee_key : null,
      }),
    });
  });
  await page.goto("/employees");
  const search = page.getByRole("textbox", {
    name: "Search employees by ID or name",
  });
  await search.fill("Alpha");
  await expect(
    page.getByText("Synthetic Alpha", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more matches" }).click();
  await expect.poll(() => paging).toBe(true);
  await search.fill("Beta");
  await expect(page.getByText("Synthetic Beta", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("Synthetic Alpha", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Synthetic Beta", { exact: true })).toHaveCount(
    1,
  );
});
