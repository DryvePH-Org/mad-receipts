import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { CategoriesManager } from "@/components/pcf/admin/categories-manager";
import type { CategoryRow } from "@/components/pcf/admin/types";
import { requireUser } from "@/lib/pcf/auth";
import { createClient } from "@/lib/supabase/server";

async function AdminCategoriesPageContent() {
  await requireUser("/pcf/categories");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active")
    .order("name");

  if (error) throw new Error(error.message);

  const categories: CategoryRow[] = data.map((category) => ({
    id: category.id,
    name: category.name,
    is_active: category.is_active,
  }));

  return <CategoriesManager categories={categories} />;
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminCategoriesPageContent />
    </Suspense>
  );
}
