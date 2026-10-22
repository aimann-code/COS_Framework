import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("expanded registration validates, retains drafts, handles repeated data and masks review", async ({
  page,
}) => {
  await page.goto("/registration-preview");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
  ).toBeFocused();
  await expect(page.locator("#onboarding-name-error")).toContainText(
    "needed before registration",
  );
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Uniform sizes/ })
    .click();
  await page
    .getByRole("region", { name: "Uniform sizes", exact: true })
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Basic details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load sample" }).click();
  const nav = page.getByRole("navigation", { name: "Registration sections" });
  await nav.getByRole("button", { name: /Banking details/ }).click();
  await page
    .getByLabel("Bank account number", { exact: true })
    .fill("000012345678");
  await expect(
    page.getByLabel("Bank account number", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show Bank account number", exact: true })
    .click();
  await expect(
    page.getByLabel("Bank account number", { exact: true }),
  ).toHaveAttribute("type", "text");
  await nav.getByRole("button", { name: /Addresses/ }).click();
  await page.getByLabel("City", { exact: true }).first().fill("Synthetic City");
  await page.getByLabel("Same as permanent address").check();
  await expect(page.getByLabel("City", { exact: true }).last()).toHaveValue(
    "Synthetic City",
  );
  await expect(page.getByLabel("City", { exact: true }).last()).toBeDisabled();
  await nav.getByRole("button", { name: /Contact & emergency/ }).click();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page
    .getByLabel("Contact name", { exact: true })
    .fill("Synthetic Guardian");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove contact 2", exact: true })
    .click();
  await expect(page.getByLabel("Contact name", { exact: true })).toHaveCount(1);
  await nav.getByRole("button", { name: /Family details/ }).click();
  await page.getByRole("button", { name: "Add child", exact: true }).click();
  await page
    .getByLabel("Child’s name", { exact: true })
    .fill("Synthetic Child");
  await nav.getByRole("button", { name: /Review profile/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review employee profile" }),
  ).toBeVisible();
  await expect(page.getByText("•••• 5678", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic Guardian", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic Child", { exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Finish preview", exact: true })
    .click();
  await expect(
    page.getByText("No employee was registered.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Employee display name", { exact: false }),
  ).toHaveValue("");
});

test("desktop and mobile registration screens fit and satisfy accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/registration-preview");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: ".local/employee-registration-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Load sample" }).click();
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Contact & emergency/ })
    .click();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.screenshot({
    path: ".local/employee-registration-contacts.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Registration sections" })
    .getByRole("button", { name: /Basic details/ })
    .click();
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
    path: ".local/employee-registration-mobile.png",
    fullPage: true,
  });
});
