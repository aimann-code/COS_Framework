export type DraftField = {
  key: string;
  label: string;
  type?: "text" | "date" | "email" | "tel" | "number" | "select";
  options?: string[];
  required?: boolean;
  sensitive?: boolean;
  hint?: string;
  wide?: boolean;
};
export type DraftSection = {
  id: string;
  title: string;
  description: string;
  fields: DraftField[];
};
export const draftSections: DraftSection[] = [
  {
    id: "basic",
    title: "Basic details",
    description: "Start with the person behind the employee record.",
    fields: [
      {
        key: "name",
        label: "Employee display name",
        required: true,
        hint: "Use the name HR will recognize in the directory.",
      },
      { key: "dob", label: "Date of birth", type: "date" },
      {
        key: "nationality",
        label: "Nationality",
        hint: "Enter the nationality recorded for this employee.",
      },
      {
        key: "blood",
        label: "Blood group",
        type: "select",
        options: ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"],
      },
      {
        key: "marital",
        label: "Marital status",
        type: "select",
        options: ["Single", "Married", "Other", "Prefer not to say"],
      },
      { key: "email", label: "Personal email address", type: "email" },
    ],
  },
  {
    id: "employment",
    title: "Employment",
    description: "Keep each joining period connected to the same person.",
    fields: [
      {
        key: "joiner",
        label: "Joining type",
        type: "select",
        options: ["New joiner", "Rejoiner"],
        required: true,
      },
      { key: "joining", label: "Joining date", type: "date", required: true },
      {
        key: "previous_id",
        label: "Previous employee reference",
        hint: "For a rejoiner, HR will verify and link the previous record.",
      },
    ],
  },
  {
    id: "salary",
    title: "Salary & allowances",
    description:
      "Capture monthly pay clearly, with a name for every allowance.",
    fields: [
      { key: "basic_salary", label: "Basic salary per month", type: "number" },
      { key: "room", label: "Room allowance per month", type: "number" },
      { key: "travel", label: "Travel allowance per month", type: "number" },
      {
        key: "pay_currency",
        label: "Currency",
        type: "select",
        options: ["INR"],
        hint: "Monthly amounts are recorded in INR.",
      },
    ],
  },
  {
    id: "banking",
    title: "Banking details",
    description: "Restricted information for authorized HR and payroll users.",
    fields: [
      { key: "beneficiary", label: "Beneficiary name" },
      {
        key: "beneficiary_relationship",
        label: "Relationship with beneficiary",
        type: "select",
        options: ["Self", "Spouse", "Parent", "Other"],
      },
      { key: "bank", label: "Bank name" },
      { key: "branch", label: "Bank branch name" },
      { key: "branch_address", label: "Bank branch address", wide: true },
      {
        key: "account_type",
        label: "Account type",
        type: "select",
        options: ["Savings", "Current", "Other"],
      },
      {
        key: "account_number",
        label: "Bank account number",
        sensitive: true,
        hint: "Stored as text to retain leading zeros.",
      },
      { key: "ifsc", label: "IFSC code" },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    description:
      "Collect only the identifiers required for the employee’s onboarding.",
    fields: [
      { key: "aadhaar", label: "Aadhaar number", sensitive: true },
      { key: "pan", label: "PAN number", sensitive: true },
      { key: "uan", label: "UAN", sensitive: true },
      { key: "esic", label: "ESIC IP number", sensitive: true },
      {
        key: "section197",
        label: "Section 197 certificate number",
        sensitive: true,
      },
    ],
  },
  {
    id: "addresses",
    title: "Addresses",
    description:
      "Separate the permanent address from where the employee currently stays.",
    fields: [],
  },
  {
    id: "contacts",
    title: "Contact & emergency",
    description: "Make it easy for HR to reach the right person when needed.",
    fields: [
      {
        key: "phone",
        label: "Personal contact number",
        type: "tel",
        required: true,
        hint: "Include the country code, for example +91.",
      },
      { key: "whatsapp", label: "WhatsApp number", type: "tel" },
      { key: "telegram", label: "Telegram number", type: "tel" },
    ],
  },
  {
    id: "family",
    title: "Family details",
    description: "Optional family information, with space for every child.",
    fields: [
      { key: "father", label: "Father’s name" },
      { key: "father_dob", label: "Father’s date of birth", type: "date" },
      { key: "mother", label: "Mother’s name" },
      { key: "mother_dob", label: "Mother’s date of birth", type: "date" },
      { key: "spouse", label: "Spouse’s name" },
      { key: "spouse_dob", label: "Spouse’s date of birth", type: "date" },
      { key: "anniversary", label: "Marriage anniversary", type: "date" },
    ],
  },
  {
    id: "education",
    title: "Education & experience",
    description: "Capture relevant qualifications and previous employment.",
    fields: [
      { key: "qualification", label: "Highest educational qualification" },
      {
        key: "experience",
        label: "Work experience",
        hint: "For example, 3 years in kitchen operations.",
      },
    ],
  },
  {
    id: "uniform",
    title: "Uniform sizes",
    description: "A practical checklist for the employee’s first day.",
    fields: [
      {
        key: "tshirt",
        label: "T-shirt size",
        type: "select",
        options: ["XS", "S", "M", "L", "XL", "XXL", "Other"],
      },
      {
        key: "shirt",
        label: "Shirt size",
        hint: "Include the sizing system, for example 40 (India).",
      },
      { key: "chef", label: "Chef coat size" },
      {
        key: "waist",
        label: "Waist size",
        hint: "Include the unit, for example 32 inches.",
      },
      {
        key: "pant",
        label: "Pant length size",
        hint: "Include the unit, for example 40 inches.",
      },
      {
        key: "shoe",
        label: "Shoe size (US)",
        hint: "Use the US sizing system.",
      },
    ],
  },
];
export const addressFields: DraftField[] = [
  { key: "house", label: "House / flat number" },
  { key: "street", label: "Street" },
  { key: "area", label: "Area / ward" },
  { key: "landmark", label: "Landmark" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "postal", label: "Postal code" },
];
export const repeatGroups: Record<
  string,
  { title: string; singular: string; fields: DraftField[] }
> = {
  allowances: {
    title: "Other allowances",
    singular: "allowance",
    fields: [
      { key: "name", label: "Allowance name" },
      { key: "amount", label: "Monthly amount", type: "number" },
    ],
  },
  emergency: {
    title: "Emergency contacts",
    singular: "contact",
    fields: [
      { key: "name", label: "Contact name" },
      {
        key: "relationship",
        label: "Relationship",
        type: "select",
        options: ["Guardian", "Parent", "Spouse", "Friend", "Other"],
      },
      { key: "phone", label: "Contact number", type: "tel" },
      {
        key: "context",
        label: "Location / context",
        type: "select",
        options: ["Local", "Hometown", "Other"],
      },
    ],
  },
  children: {
    title: "Children",
    singular: "child",
    fields: [
      { key: "name", label: "Child’s name" },
      { key: "dob", label: "Child’s date of birth", type: "date" },
    ],
  },
  employers: {
    title: "Previous employment",
    singular: "employer",
    fields: [
      { key: "name", label: "Previous employer" },
      { key: "designation", label: "Previous designation" },
    ],
  },
};
