import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { normalizePlate } from "@/lib/rules/plate";

// What the car's page shows about the car itself, beyond its documents: its status and the jobs of the repairs list.

export interface CarFacts {
  unit: { stockState: string | null; stateFor: string | null; stateOn: string | null; location: string | null; inStock: boolean; chassisNo: string | null; engineNo: string | null; owner: string | null; office: string | null; papersWith: string | null } | null;
  repairs: { id: string; problem: string | null; status: string | null; approval: string; dueOn: string | null; company: string | null }[];
}

export async function loadCarFacts(plate: string): Promise<CarFacts> {
  const key = normalizePlate(plate);
  const db = docsDb();
  const [{ data: u }, { data: r }] = await Promise.all([
    db.from("docs_units_current").select("stock_state, state_for, state_on, location, in_stock, chassis_no, engine_no, reg_owner_name, mo_file, papers_with").eq("plate_no", key).maybeSingle(),
    db.from("car_repairs").select("id, problem, status, approval, due_on, company").eq("plate_no", key).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    unit: u ? { stockState: (u.stock_state as string | null) ?? null, stateFor: (u.state_for as string | null) ?? null, stateOn: (u.state_on as string | null) ?? null, location: (u.location as string | null) ?? null, inStock: !!u.in_stock,
      chassisNo: (u.chassis_no as string | null) ?? null, engineNo: (u.engine_no as string | null) ?? null, owner: (u.reg_owner_name as string | null) ?? null, office: (u.mo_file as string | null) ?? null, papersWith: (u.papers_with as string | null) ?? null } : null,
    repairs: (r ?? []).map((x) => ({ id: x.id as string, problem: (x.problem as string | null) ?? null, status: (x.status as string | null) ?? null, approval: (x.approval as string) ?? "approved", dueOn: (x.due_on as string | null) ?? null, company: (x.company as string | null) ?? null })),
  };
}
