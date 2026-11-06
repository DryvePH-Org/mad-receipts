"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import { setCategoryActive } from "@/lib/pcf/actions/categories";
import { CategoryFormDialog } from "@/components/pcf/admin/category-form-dialog";
import type { CategoryRow } from "@/components/pcf/admin/types";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/pcf/shared/confirm-dialog";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function CategoriesManager({
  categories,
}: {
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deactivating, setDeactivating] = useState<CategoryRow | null>(null);
  const [pending, setPending] = useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openRename(category: CategoryRow) {
    setEditing(category);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Category renamed" : "Category added");
    router.refresh();
  }

  async function setActive(category: CategoryRow, isActive: boolean) {
    setPending(true);
    const result = await setCategoryActive({ id: category.id, isActive });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setDeactivating(null);
    toast.success(isActive ? "Category reactivated" : "Category deactivated");
    router.refresh();
  }

  const columns: ResponsiveListColumn<CategoryRow>[] = [
    {
      key: "name",
      header: "Category",
      cell: (category) => (
        <span className={category.is_active ? "font-medium" : ""}>
          {category.name}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (category) => <CategoryStatus category={category} />,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (category) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openRename(category)}
          >
            Rename
          </Button>
          {category.is_active ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeactivating(category)}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => void setActive(category, true)}
            >
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Expense categories used on vouchers and reports."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New category
          </Button>
        }
      />

      <ResponsiveList
        rows={categories}
        columns={columns}
        getRowKey={(category) => category.id}
        renderCard={(category) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{category.name}</p>
                  <CategoryStatus category={category} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openRename(category)}
                >
                  Rename
                </Button>
                {category.is_active ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeactivating(category)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => void setActive(category, true)}
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Add categories so vouchers and reports stay organized."
          />
        }
      />

      {formOpen ? (
        <CategoryFormDialog
          open
          onOpenChange={setFormOpen}
          category={editing}
          onSaved={handleSaved}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(next) => {
          if (!next) setDeactivating(null);
        }}
        title="Deactivate category?"
        description={
          deactivating
            ? `${deactivating.name} stops appearing in new vouchers. Existing vouchers keep it.`
            : ""
        }
        confirmLabel="Deactivate"
        destructive
        pending={pending}
        onConfirm={() => {
          if (deactivating) void setActive(deactivating, false);
        }}
      />
    </div>
  );
}

function CategoryStatus({ category }: { category: CategoryRow }) {
  return category.is_active ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline">Inactive</Badge>
  );
}
