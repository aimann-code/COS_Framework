import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const secrets = JSON.parse(
  readFileSync(".local/backend-secrets.json", "utf8").replace(/^\uFEFF/, ""),
);
const root = "/api/v1/cos";
async function signIn(
  page: Page,
  user: string,
  password = secrets[`COS_${user.toUpperCase()}_PASSWORD`],
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or username", { exact: true }).fill(user);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/people(?:\/configuration|\/me)?$/, {
    timeout: 20000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
async function command(
  ctx: BrowserContext,
  path: string,
  body: unknown,
  method = "POST",
) {
  const csrf = await ctx.request.get(root + "/csrf");
  const { token } = await csrf.json();
  return ctx.request.fetch(root + path, {
    method,
    headers: { "X-CSRF-TOKEN": token },
    data: body,
  });
}
async function create(page: Page, name: string) {
  const id = crypto.randomUUID();
  const response = await command(
    page.context(),
    "/onboarding/drafts/" + id,
    {
      expected_version: 0,
      configuration_version: (
        await (await page.request.get(root + "/onboarding/schema")).json()
      ).configuration_version,
      profile: {
        values: {
          name,
          joiner: "New joiner",
          joining: "2026-10-22",
          phone: "9000000001",
        },
        groups: {},
        same_address: false,
      },
    },
    "PUT",
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const draft = await response.json();
  const registered = await command(
    page.context(),
    "/onboarding/drafts/" + id + "/register",
    { version: draft.version },
  );
  expect(registered.ok(), await registered.text()).toBeTruthy();
  return registered.json();
}
test("HR saves and resumes the expanded form, uploads private photo and registers directly", async ({
  page,
}) => {
  await signIn(page, "registrar");
  await page.goto("/people/register");
  const name = "Synthetic UI " + Date.now();
  await page.getByLabel("Employee display name", { exact: false }).fill(name);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/drafts\//);
  await page.reload();
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
  ).toHaveValue(name);
  const nav = page.getByRole("navigation", { name: "Registration sections" });
  await nav.getByRole("button", { name: /Employment/ }).click();
  await page
    .getByLabel("Joining type", { exact: false })
    .selectOption("New joiner");
  await page.getByLabel("Joining date", { exact: false }).fill("2026-10-22");
  await nav.getByRole("button", { name: /Contact & emergency/ }).click();
  await page
    .getByLabel("Personal contact number", { exact: false })
    .fill("9000000001");
  await nav.getByRole("button", { name: /Document photos/ }).click();
  const bytes = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    c.getContext("2d")!.fillRect(0, 0, 2, 2);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Choose PAN photo").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes, "base64"),
  });
  await expect(
    page.getByText("Photo uploaded and encrypted.", { exact: false }),
  ).toBeVisible();
  await nav.getByRole("button", { name: /Review profile/ }).click();
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await expect(page).toHaveURL(/\/people\/employees\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const link = page.getByRole("link", { name: /PAN card.*Download/ });
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/connected-employee-profile.png",
    fullPage: true,
  });
});
test("HR links self-service, employee requests change, HR approves, admin cannot access profile", async ({
  page,
  browser,
}) => {
  await signIn(page, "registrar");
  const e = await create(page, "Synthetic Self Service " + Date.now());
  const email = `synthetic.${Date.now()}@example.test`,
    password = "SyntheticOnly!42abc";
  const employeeContext = await browser.newContext();
  const ep = await employeeContext.newPage();
  await ep.goto("/sign-up");
  const signup = await command(employeeContext, "/auth/sign-up", {
    full_name: "Synthetic Employee",
    email,
    password,
  });
  expect(signup.status(), await signup.text()).toBe(202);
  await page.goto("/people/accounts");
  const card = page.getByRole("region", {
    name: `Access request for ${email}`,
  });
  await card.getByLabel("Verified employee code").fill(e.employee_code);
  await card.getByRole("button", { name: "Activate employee access" }).click();
  await expect(card).toHaveCount(0);
  await signIn(ep, email, password);
  await expect(ep).toHaveURL(/\/people\/me$/);
  await ep
    .getByRole("link", { name: "Request an update", exact: true })
    .click();
  const changed = "Synthetic Updated " + Date.now();
  await ep.getByLabel("Employee display name", { exact: false }).fill(changed);
  await ep
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Review profile/ })
    .click();
  await ep.getByRole("button", { name: "Send to HR", exact: true }).click();
  await expect(ep).toHaveURL(/\/people\/me$/);
  await expect(ep.getByRole("heading", { level: 1 })).toHaveText(
    "My employee profile",
  );
  const pending = await (
    await employeeContext.request.get(root + "/onboarding/requests")
  ).json();
  expect(pending.length).toBeGreaterThan(0);
  await page.goto("/people/reviews/" + pending[0].draft_id);
  await page
    .getByRole("button", { name: "Approve and apply", exact: true })
    .click();
  await ep.reload();
  await expect(ep.getByText(changed, { exact: true })).toBeVisible();
  const adminContext = await browser.newContext();
  const ap = await adminContext.newPage();
  await signIn(ap, "admin");
  expect(
    (
      await adminContext.request.get(
        root + "/onboarding/employees/" + e.employee_id,
      )
    ).status(),
  ).toBe(403);
  expect(
    (await adminContext.request.get(root + "/accounts/pending")).status(),
  ).toBe(403);
  await employeeContext.close();
  await adminContext.close();
});
test("stale draft versions fail, arbitrary numeric identity values are rejected", async ({
  page,
}) => {
  await signIn(page, "registrar");
  const schema = await (
    await page.request.get(root + "/onboarding/schema")
  ).json();
  const id = crypto.randomUUID();
  const payload = {
    expected_version: 0,
    configuration_version: schema.configuration_version,
    profile: {
      values: { name: "Synthetic concurrency" },
      groups: {},
      same_address: false,
    },
  };
  expect(
    (
      await command(page.context(), "/onboarding/drafts/" + id, payload, "PUT")
    ).status(),
  ).toBe(200);
  expect(
    (
      await command(page.context(), "/onboarding/drafts/" + id, payload, "PUT")
    ).status(),
  ).toBe(409);
  expect(
    (
      await command(
        page.context(),
        "/onboarding/drafts/" + crypto.randomUUID(),
        {
          ...payload,
          profile: { ...payload.profile, values: { aadhaar: 123456789012 } },
        },
        "PUT",
      )
    ).status(),
  ).toBe(422);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/people/register");
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
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
    path: ".local/connected-registration-mobile.png",
    fullPage: true,
  });
});

test("HR proposes a company field, admin approves configuration and the form receives it", async ({
  page,
  browser,
}) => {
  await signIn(page, "registrar");
  await page.goto("/people/configuration");
  const label = "Synthetic Field " + Date.now();
  await page.getByLabel("New field label").fill(label);
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit configuration proposal", exact: true })
    .click();
  await expect(
    page.getByText("Configuration proposal submitted for admin approval.", {
      exact: true,
    }),
  ).toBeVisible();
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin, "admin");
  const card = admin
    .locator("section")
    .filter({ has: admin.getByRole("listitem").filter({ hasText: label }) });
  await card
    .getByRole("button", { name: "Approve configuration", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(root + "/onboarding/schema");
        return (await response.json()).additional_fields.some(
          (f: { label: string }) => f.label === label,
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.goto("/people/register");
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Company fields/ })
    .click();
  await expect(page.getByLabel(label, { exact: false })).toBeVisible();
  await ctx.close();
});

test("workspace navigation keeps one shell and HR can edit an employee later", async ({
  page,
}) => {
  await signIn(page, "registrar");
  const e = await create(page, "Synthetic Edit " + Date.now());
  await page
    .getByRole("navigation", { name: "Employee Management" })
    .getByRole("link", { name: "Register employee", exact: true })
    .click();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Employee Management" })
      .getByRole("link", { name: "Register employee", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("navigation", { name: "Employee Management" })
    .getByRole("link", { name: "Employee directory", exact: true })
    .click();
  await expect(page).toHaveURL(/\/people\/directory$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/people\/register$/);
  await page.reload();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/people$/);
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/people\/directory$/);
  await page.goto("/people/employees/" + e.employee_id);
  await page
    .getByRole("button", { name: "Edit employee", exact: true })
    .click();
  await expect(page).toHaveURL(/\/people\/drafts\//);
  const name = "Synthetic HR Updated " + Date.now();
  await page.getByLabel("Employee display name", { exact: false }).fill(name);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
  ).toHaveValue(name);
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Employment/ })
    .click();
  await expect(
    page.getByLabel("Joining date", { exact: false }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Salary & allowances/ })
    .click();
  await page
    .getByLabel("Basic salary per month", { exact: true })
    .fill("25000");
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Review profile/ })
    .click();
  await page
    .getByRole("button", { name: "Save employee changes", exact: true })
    .click();
  await expect(page).toHaveURL("/people/employees/" + e.employee_id);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("25000", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await page.screenshot({
    path: ".local/hr-updated-profile.png",
    fullPage: true,
  });
  await page.goto("/people/register");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByLabel("Employee display name", { exact: false })
    .fill("Unsaved synthetic change");
  await page
    .getByRole("navigation", { name: "Employee Management" })
    .getByRole("link", { name: "Employee directory", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
  ).toHaveValue("Unsaved synthetic change");
  await page
    .getByRole("navigation", { name: "Employee Management" })
    .getByRole("link", { name: "Employee directory", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/people\/directory$/);
  await page
    .getByRole("navigation", { name: "Employee Management" })
    .getByRole("link", { name: "Register employee", exact: true })
    .click();
  await page.screenshot({
    path: ".local/unified-registration-desktop.png",
    fullPage: true,
  });
});
