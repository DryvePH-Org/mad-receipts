"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus } from "lucide-react";
import { toast } from "sonner";

import { FundFormDialog } from "@/components/pcf/admin/fund-form-dialog";
import type {
  CustodianOption,
  FundRow,
} from "@/components/pcf/admin/types";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function FundsManager({
  funds,
  custodians,
}: {
  funds: FundRow[];
  custodians: CustodianOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FundRow | null>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(fund: FundRow) {
    setEditing(fund);
    setOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Fund updated" : "Fund created");
    router.refresh();
  }

  const columns: ResponsiveListColumn<FundRow>[] = [
    {
      key: "name",
      header: "Fund",
      cell: (fund) => <span className="font-medium">{fund.name}</span>,
    },
    {
      key: "amount",
      header: "Fund amount",
      headerClassName: "text-right",
      className: "text-right",
      cell: (fund) => <MoneyText value={fund.amount} />,
    },
    {
      key: "limit",
      header: "Per transaction",
      headerClassName: "text-right",
      className: "text-right",
      cell: (fund) => <MoneyText value={fund.per_txn_limit} />,
    },
    {
      key: "approval",
      header: "Approval from",
      headerClassName: "text-right",
      className: "text-right",
      cell: (fund) => <MoneyText value={fund.approval_threshold} />,
    },
    {
      key: "low",
      header: "Low-balance alert",
      headerClassName: "text-right",
      className: "text-right",
      cell: (fund) => `${fund.low_balance_pct}%`,
    },
    {
      key: "custodian",
      header: "Custodian",
      cell: (fund) =>
        fund.custodian_names.length > 0 ? fund.custodian_names.join(", ") : "Unassigned",
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (fund) => (
        <Button variant="outline" size="sm" onClick={() => openEdit(fund)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funds"
        description="Fund amounts, limits, and the custodians who run each fund."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New fund
          </Button>
        }
      />

      <ResponsiveList
        rows={funds}
        columns={columns}
        getRowKey={(fund) => fund.id}
        renderCard={(fund) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{fund.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {fund.custodian_names.length > 0
                      ? fund.custodian_names.join(", ")
                      : "Unassigned"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(fund)}
                >
                  Edit
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Fund amount</dt>
                  <dd>
                    <MoneyText value={fund.amount} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Per transaction</dt>
                  <dd>
                    <MoneyText value={fund.per_txn_limit} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Approval from</dt>
                  <dd>
                    <MoneyText value={fund.approval_threshold} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Low-balance alert</dt>
                  <dd>{fund.low_balance_pct}%</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={Landmark}
            title="No funds yet"
            description="Create a fund to set its amount, limit, and custodian."
          />
        }
      />

      {open ? (
        <FundFormDialog
          open
          onOpenChange={setOpen}
          fund={editing}
          custodians={custodians}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
