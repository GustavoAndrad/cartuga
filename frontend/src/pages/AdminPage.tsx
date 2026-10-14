import { useState } from "react";

import { AssistantLogsTab } from "../components/admin/AssistantLogsTab";
import { BankImportTab } from "../components/admin/BankImportTab";
import { DatabaseTab } from "../components/admin/DatabaseTab";
import { UsersTab } from "../components/admin/UsersTab";

type Tab = "database" | "bank-import" | "users" | "assistant-logs";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("database");

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${
      active
        ? "bg-cartuga-600 text-white"
        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        Gerenciamento
      </h1>

      <div className="flex flex-wrap gap-2 border-b border-neutral-300 pb-2 dark:border-neutral-800">
        <button onClick={() => setTab("database")} className={tabClass(tab === "database")}>
          Importação / Exportação
        </button>
        <button onClick={() => setTab("bank-import")} className={tabClass(tab === "bank-import")}>
          Importar extrato
        </button>
        <button onClick={() => setTab("users")} className={tabClass(tab === "users")}>
          Usuários
        </button>
        <button onClick={() => setTab("assistant-logs")} className={tabClass(tab === "assistant-logs")}>
          Logs do Assistente
        </button>
      </div>

      {tab === "database" && <DatabaseTab />}
      {tab === "bank-import" && <BankImportTab />}
      {tab === "users" && <UsersTab />}
      {tab === "assistant-logs" && <AssistantLogsTab />}
    </div>
  );
}
