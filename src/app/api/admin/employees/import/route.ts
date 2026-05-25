import { handleApiError, json, requireAdminUser, RequestError } from "@/server/api/http";
import { employeesRepository } from "@/server/repositories/employees";
import * as XLSX from "xlsx";

// GET: return current count
export async function GET() {
  try {
    await requireAdminUser();
    const repo = employeesRepository();
    const total = await repo.count();
    return json({ total });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: multipart upload of .xlsx or .csv — parses and upserts employees
export async function POST(request: Request) {
  try {
    await requireAdminUser();

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new RequestError("Expected multipart/form-data with a 'file' field", 400);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new RequestError("No file uploaded", 400);
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const fileName = (file as File).name.toLowerCase();

    let rows: Array<{ employeeId: string; lastName: string; firstName: string; fullName: string; hireDate: string }>;

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      rows = parseXlsx(buffer);
    } else if (fileName.endsWith(".csv")) {
      rows = parseCsv(buffer.toString("utf8"));
    } else {
      throw new RequestError("Unsupported file type. Upload .xlsx or .csv", 400);
    }

    if (rows.length === 0) {
      throw new RequestError("No valid employee rows found in the file", 422);
    }

    const repo = employeesRepository();
    const result = await repo.bulkUpsert(rows);
    const total = await repo.count();

    return json({ imported: result.count, total, parsed: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}

function parseXlsx(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, dateNF: "yyyy-mm-dd" });
  return parseRows(raw);
}

function parseCsv(text: string) {
  const wb = XLSX.read(text, { type: "string", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, dateNF: "yyyy-mm-dd" });
  return parseRows(raw);
}

function parseRows(raw: Record<string, unknown>[]) {
  const rows: Array<{ employeeId: string; lastName: string; firstName: string; fullName: string; hireDate: string }> = [];

  for (const r of raw) {
    // Support both column name variants
    const employeeId = str(r["Employee ID"] ?? r["employeeId"] ?? r["employee_id"]);
    const lastName = str(r["Legal Name - Last Name"] ?? r["lastName"] ?? r["last_name"] ?? r["Last Name"]);
    const firstName = str(r["Legal Name - First Name"] ?? r["firstName"] ?? r["first_name"] ?? r["First Name"]);
    const fullName = str(r["Full Legal Name"] ?? r["fullName"] ?? r["full_name"] ?? r["Full Name"]) || `${firstName} ${lastName}`.trim();
    const hireDate = parseDate(r["Hire Date"] ?? r["hireDate"] ?? r["hire_date"] ?? r["Date of Joining"]);

    if (!employeeId || !lastName || !hireDate) continue;

    rows.push({
      employeeId: employeeId.padStart(5, "0"),
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      fullName: fullName.trim(),
      hireDate
    });
  }

  return rows;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function parseDate(v: unknown): string {
  if (!v) return "";
  // Already a Date object (from cellDates: true)
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}
