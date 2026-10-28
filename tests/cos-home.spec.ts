import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public homepage leads companies to service selection without exposing internal records", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("COS · CulinaOS");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your company.Your connected workspace.",
  );

  const companyLinks = page.locator('a[href="/company-register"]');
  expect(await companyLinks.count()).toBeGreaterThanOrEqual(5);
  await expect(
    page.getByRole("link", { name: "Choose your services", exact: true }),
  ).toHaveAttribute("href", "/company-register");
  await expect(
    page.getByRole("link", {
      name: "Create your employee account",
      exact: true,
    }),
  ).toHaveAttribute("href", "/sign-up");
  await expect(page.locator("#services")).toContainText(
    "Review availability and charges before you submit.",
  );
  await expect(
    page.locator("#services").getByText("Planned", { exact: true }),
  ).toHaveCount(2);
  await expect(page.locator("#how-it-works > div > ol > li")).toHaveCount(4);
  await expect(page.locator("#how-it-works")).toContainText(
    "only after administrator approval",
  );

  const hrefs = await page
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(
    hrefs.filter((href) =>
      /github|governance|architecture|blueprint|drive\.google|docs\.google/i.test(
        href ?? "",
      ),
    ),
  ).toEqual([]);
  await expect(page.locator("main")).not.toContainText(
    /architecture|blueprint|47 engines|9 suites/i,
  );

  const preview = page.getByLabel("Explore workspace examples");
  await expect(
    preview.getByRole("button", { name: "Company", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#workspace-preview")).toContainText(
    "Start after approval and activation",
  );
  await preview.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.locator("#workspace-preview")).toContainText(
    "HR verifies and activates access",
  );
  await preview.getByRole("button", { name: "Configure", exact: true }).click();
  await expect(page.locator("#workspace-preview")).toContainText(
    "Administrator reviews the request",
  );
  await preview.getByRole("button", { name: "Company", exact: true }).click();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: `tmp/cos-home-company-${testInfo.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("company and employee entry points remain distinct; navigation and keyboard work", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  if (testInfo.project.name === "mobile") {
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    const mobileNavigation = page.getByRole("navigation", {
      name: "Mobile navigation",
    });
    await expect(
      mobileNavigation.getByRole("link", { name: "Register company" }),
    ).toHaveAttribute("href", "/company-register");
    await mobileNavigation
      .getByRole("link", { name: "Services", exact: true })
      .click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
  await page
    .getByRole("link", { name: "Open my workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fpeople%2Fme$/);
  await expect(page.locator("form")).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("link", { name: "Create your employee account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.locator("form")).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("link", { name: "Register your company", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/company-register$/);
});
