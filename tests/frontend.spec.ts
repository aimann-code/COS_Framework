import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function registration(page: Page, mode = "AUTO", name = "Test Employee") {
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await page.getByLabel("Employee name", { exact: false }).fill(name);
  await page.getByLabel("EMP ID generation mode").selectOption(mode);
  await page.getByLabel("Father’s name").fill("Test Father");
  await page.getByLabel("Nationality", { exact: false }).selectOption("India");
  await page.getByLabel("National ID type").selectOption("Passport");
  await page.getByLabel("ID number", { exact: false }).fill("FICTIONAL9000");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Auto registration requires admin approval before it enters the directory", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await registration(page);
  await expect(page.locator("#sys_emp_id")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for approval" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search employees by ID or name" })
    .fill("Test Employee");
  await expect(
    page.getByRole("heading", { name: "No employees found" }),
  ).toBeVisible();
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("System admin");
  await page.getByRole("button", { name: /^My requests/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Test Employee" })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog")).not.toContainText("FICTIONAL9000");
  await page.getByRole("button", { name: "Approve & apply" }).click();
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search employees by ID or name" })
    .fill("Test Employee");
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await expect(page.locator(".print-area")).toContainText("Test Employee");
  await expect(page.locator(".print-area")).toContainText("•••• 9000");
  await expect(page.locator(".print-area")).not.toContainText("FICTIONAL9000");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Manual mode preserves leading zeros, validates missing IDs, and retains a navigation draft", async ({
  page,
}) => {
  await registration(page, "MANUAL");
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByText("Enter an employee ID for Manual mode.", { exact: true }),
  ).toBeVisible();
  await page.locator("#sys_emp_id").fill("0000123");
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Employee registration", exact: true })
    .click();
  await expect(page.locator("#sys_emp_id")).toHaveValue("0000123");
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View my requests", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Test Employee" })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog")).toContainText("0000123");
});

test("duplicates are blocked and Auto clears a previous Manual ID", async ({
  page,
}) => {
  await registration(page, "MANUAL");
  await page.locator("#sys_emp_id").fill("DEMO-0001");
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByText("This employee ID already exists.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("EMP ID generation mode").selectOption("AUTO");
  await expect(page.locator("#sys_emp_id")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for approval" }),
  ).toBeVisible();
});

test("configuration is reviewed before publication and stale requests cannot execute", async ({
  page,
}) => {
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("System admin");
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await page.getByLabel("Require Date of birth").check();
  await page
    .getByRole("button", { name: "Submit configuration", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Configuration update" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Approve & apply" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Ananya Rao" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Approve & apply" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Configuration version has changed",
  );
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("Registration user");
  await registration(page);
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByText("Date of birth is required.", { exact: true }),
  ).toBeVisible();
});

test("CSV preview masks identifiers and blocks within-file duplicates", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await page.getByRole("button", { name: "Bulk Upload", exact: true }).click();
  const csv =
    "employee_name,empid_entry_mode,sys_emp_id,father_name,nationality_id,national_id_type_id,id_number\nCSV Person,MANUAL,0000999,CSV Father,India,Passport,FAKEIMPORT9000\nCSV Duplicate,MANUAL,0000999,CSV Father,India,Passport,FAKEIMPORT9000";
  await page.getByLabel("Choose employee CSV file").setInputFiles({
    name: "example.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(
    page.getByText("Duplicate identity or employee ID within this file.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".preview-table")).not.toContainText(
    "FAKEIMPORT9000",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Submit for approval", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Choose employee CSV file").setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv.split("\n").slice(0, 2).join("\n")),
  });
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Submitted for approval" }),
  ).toBeVisible();
});

test("Sheet Sync explains connection requirements and does not claim live access", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Google Sheet Sync", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Not connected to this application",
  );
  await expect(
    page.getByRole("button", { name: "Preview changes", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("viewer navigation omits admin and registration actions", async ({
  page,
}) => {
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("Employee viewer");
  await expect(
    page.getByRole("button", { name: "Configuration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Register employee", exact: true }),
  ).toHaveCount(0);
});

test("mobile navigation and forms fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Employee Management", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Employee registration", exact: true })
    .click();
  await expect(page.locator("#employee_name")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/mobile-registration.png",
    fullPage: true,
  });
});

test("desktop dashboard and registration render without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/desktop-registration.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("employee updates preserve the ID and rejection leaves the accepted record unchanged", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Aarav Sharma" })
    .getByRole("button", { name: "View details" })
    .click();
  await page
    .getByRole("button", { name: "Request update", exact: true })
    .click();
  await expect(page.locator("#sys_emp_id")).toBeDisabled();
  await expect(page.locator("#sys_emp_id")).toHaveValue("DEMO-0001");
  await page.locator("#employee_name").fill("Updated Aarav");
  await page
    .getByRole("button", { name: "Submit for approval", exact: true })
    .click();
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("System admin");
  await page.getByRole("button", { name: /^My requests/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Updated Aarav" })
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("button", { name: "Reject request", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Review note")
    .fill("Illustrative rejection for workflow verification.");
  await page
    .getByRole("button", { name: "Reject request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("Aarav Sharma");
  await expect(page.getByRole("table")).not.toContainText("Updated Aarav");
});

test("main screens satisfy automated WCAG A and AA checks", async ({
  page,
}) => {
  const checks = async () => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  };
  await checks();
  await page
    .getByRole("button", { name: "Register employee", exact: true })
    .click();
  await checks();
  await page
    .getByLabel("Demo role", { exact: true })
    .selectOption("System admin");
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await checks();
  await page.screenshot({
    path: "test-results/desktop-configuration.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^My requests/ }).click();
  await checks();
  await page
    .getByRole("row")
    .filter({ hasText: "Ananya Rao" })
    .getByRole("button")
    .click();
  await checks();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Employee details", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Aarav Sharma" })
    .getByRole("button")
    .click();
  await checks();
  await page.screenshot({
    path: "test-results/desktop-employee-details.png",
    fullPage: true,
  });
});
